<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Models\Order;
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

        // Order 状態の同期 (docs/design/error-handling.md §8.4)。
        // 真値遷移は webhook 経由でのみ起こす。本 method は DB::transaction の中で
        // 呼ばれる前提なので Transaction 更新と Order 更新は atomic に commit される。
        $this->syncOrderStatus($transaction);

        return $internalId;
    }

    /**
     * Transaction の最新状態を見て Order.status を同期する。
     *
     * - Transaction.SUCCEEDED かつ Order.PENDING → Order.PAID
     * - payment_failed / canceled では Order は触らない (別カードで再決済可能)
     * - 明示的キャンセル (Order.canceled) は別 API の責務
     */
    private function syncOrderStatus(Transaction $transaction): void
    {
        if ($transaction->status !== PaymentStatus::SUCCEEDED) {
            return;
        }

        $order = Order::query()->find($transaction->order_id);
        if ($order === null || $order->status !== OrderStatus::PENDING) {
            return;
        }

        $order->status = OrderStatus::PAID;
        $order->save();
    }
}
