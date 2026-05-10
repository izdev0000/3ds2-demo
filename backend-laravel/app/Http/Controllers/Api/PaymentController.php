<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Adapters\PaymentAdapterInterface;
use App\DTO\ConfirmPaymentRequest;
use App\DTO\CreatePaymentRequest;
use App\DTO\PaymentEventResponse;
use App\Http\Controllers\Controller;
use App\Models\Transaction;
use App\Models\WebhookEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Payment endpoints。
 *
 * @see docs/api-contract.yaml createPayment / getPayment / confirmPayment / listPaymentEvents
 *
 * 実装段階:
 *   - create:   実装済み (Y3-3)
 *   - show:     実装済み (Y3-4)
 *   - confirm:  実装済み (Y3-4)
 *   - events:   実装済み (Y3-7)
 */
final class PaymentController extends Controller
{
    public function __construct(
        private readonly PaymentAdapterInterface $adapter,
    ) {}

    public function create(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'integer', 'min:50'],
            'currency' => ['required', 'string', 'size:3'],
            'return_url' => ['nullable', 'url'],
        ]);

        $dto = CreatePaymentRequest::fromArray($validated);
        $response = $this->adapter->createPayment($dto);

        return response()->json($response->toArray(), 201);
    }

    public function show(string $id): JsonResponse
    {
        $response = $this->adapter->getPayment($id);

        return response()->json($response->toArray());
    }

    public function confirm(Request $request, string $id): JsonResponse
    {
        $validated = $request->validate([
            'payment_method_id' => ['required', 'string'],
            'flow' => ['nullable', 'string', Rule::in(['client_sdk', 'server_redirect'])],
            // server_redirect は issuer 復帰用に return_url 必須
            'return_url' => ['required_if:flow,server_redirect', 'nullable', 'url'],
        ]);

        $dto = ConfirmPaymentRequest::fromArray($validated);
        $response = $this->adapter->confirmPayment($id, $dto, $dto->flow);

        return response()->json($response->toArray());
    }

    public function events(string $id): JsonResponse
    {
        // Transaction 不在は 404 で返したいので存在検査を先にする
        Transaction::query()->findOrFail($id);

        $events = WebhookEvent::query()
            ->where('transaction_id', $id)
            ->orderBy('received_at')
            ->get()
            ->map(fn (WebhookEvent $event) => PaymentEventResponse::fromModel($event)->toArray())
            ->all();

        return response()->json(['events' => $events]);
    }
}
