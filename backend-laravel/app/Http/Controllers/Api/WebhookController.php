<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Adapters\PaymentAdapterInterface;
use App\Http\Controllers\Controller;
use App\Models\WebhookEvent;
use App\Services\StripeEventHandler;
use App\Support\IdGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Stripe webhook endpoint。
 *
 * @see docs/api-contract.yaml receiveStripeWebhook
 *
 * 流れ:
 *   1. raw payload + Stripe-Signature header を取り出す
 *   2. PaymentAdapterInterface::verifyWebhookSignature で HMAC + timestamp を検証
 *   3. event id で idempotency 検査 (重複なら no-op で 204)
 *   4. DB トランザクション内で WebhookEvent を insert + StripeEventHandler で
 *      Transaction の status / next_action を同期
 *   5. 204 で返却
 *
 * 失敗時:
 *   - 署名検証失敗 / payload 不正 → 400 (Stripe が retry してくれるが、
 *     本来は永続的失敗なので 400 でも良い)
 *   - DB 障害等の internal error → 例外を再 throw して 500
 *     (Stripe が指数バックオフで retry)
 */
final class WebhookController extends Controller
{
    public function __construct(
        private readonly PaymentAdapterInterface $adapter,
        private readonly StripeEventHandler $handler,
    ) {}

    public function stripe(Request $request): JsonResponse|Response
    {
        $payload = $request->getContent();
        $signature = (string) $request->header('Stripe-Signature', '');

        // Step 1: 署名検証 + parse
        try {
            $event = $this->adapter->verifyWebhookSignature($payload, $signature);
        } catch (RuntimeException $e) {
            Log::warning('Stripe webhook verification failed', [
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'code' => 'signature_verification_failed',
                'message' => $e->getMessage(),
            ], 400);
        }

        $eventId = (string) ($event['id'] ?? '');
        $eventType = (string) ($event['type'] ?? '');

        if ($eventId === '' || $eventType === '') {
            return response()->json([
                'code' => 'invalid_payload',
                'message' => 'event.id and event.type are required.',
            ], 400);
        }

        // Step 2: idempotency 検査 (psp_event_id 既登録なら no-op)
        $alreadyProcessed = WebhookEvent::query()
            ->where('psp', 'stripe')
            ->where('psp_event_id', $eventId)
            ->exists();

        if ($alreadyProcessed) {
            return response()->noContent();
        }

        // Step 3: 永続化 + 状態反映を 1 transaction で
        DB::transaction(function () use ($event, $eventId, $eventType): void {
            $transactionId = $this->handler->handle($event);

            WebhookEvent::create([
                'id' => IdGenerator::webhookEventId(),
                'psp' => 'stripe',
                'psp_event_id' => $eventId,
                'event_type' => $eventType,
                'transaction_id' => $transactionId,
                'payload' => $event,
                'received_at' => now(),
                'processed_at' => now(),
            ]);
        });

        return response()->noContent();
    }
}
