<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\PaymentStatus;
use App\Models\Transaction;

/**
 * Stripe webhook event を受けて Transaction の status / next_action を同期する。
 *
 * 責務:
 *   - parse 済み event を解釈して該当 Transaction を更新する
 *   - idempotency 担保 (psp_event_id の unique 制約) や WebhookEvent の永続化は
 *     呼び出し元 (WebhookController) の責務とする
 *
 * 対応 event は payment_intent.* 系のみ。
 * その他 (charge.*, refund.* 等) は本デモのスコープ外で no-op。
 */
final class StripeEventHandler
{
    /**
     * @param  array<string, mixed>  $event  Stripe Event (parse 済み)
     * @return string|null 更新した Transaction の内部 ID (該当なし or no-op の場合 null)
     */
    public function handle(array $event): ?string
    {
        $type = (string) ($event['type'] ?? '');
        $object = $event['data']['object'] ?? null;

        if (! is_array($object)) {
            return null;
        }

        // payment_intent.* (succeeded / payment_failed / requires_action / canceled / processing 等)
        if (str_starts_with($type, 'payment_intent.')) {
            return $this->handlePaymentIntent($object);
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $intent  Stripe PaymentIntent の data.object
     */
    private function handlePaymentIntent(array $intent): ?string
    {
        // create 時に metadata.internal_transaction_id を仕込んでいるので
        // それを使って Transaction を引く。
        $internalId = $intent['metadata']['internal_transaction_id'] ?? null;
        if (! is_string($internalId) || $internalId === '') {
            return null;
        }

        /** @var Transaction|null $transaction */
        $transaction = Transaction::query()->find($internalId);
        if ($transaction === null) {
            return null;
        }

        $statusValue = $intent['status'] ?? null;
        if (is_string($statusValue)) {
            $transaction->status = PaymentStatus::from($statusValue);
        }

        $nextAction = $intent['next_action'] ?? null;
        $transaction->next_action = is_array($nextAction) ? $nextAction : null;

        $transaction->save();

        return $internalId;
    }
}
