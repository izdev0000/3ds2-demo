<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Order の業務状態。
 *
 * Transaction (= Stripe PaymentIntent) の status とは独立した業務軸の状態で、
 * 真値遷移は webhook 経由でのみ起きる (docs/design/error-handling.md §8.4)。
 *
 * | case     | 入口                                                          |
 * | -------- | ------------------------------------------------------------- |
 * | PENDING  | POST /api/orders による新規作成時                              |
 * | PAID     | payment_intent.succeeded webhook 受信 + DB tx 内で同期         |
 * | CANCELED | 決済前のキャンセル or 全 Transaction が canceled に到達した場合 |
 * | REFUNDED | 返金完了 (本デモでは未実装、後続)                              |
 */
enum OrderStatus: string
{
    case PENDING = 'pending';
    case PAID = 'paid';
    case CANCELED = 'canceled';
    case REFUNDED = 'refunded';

    public function isTerminal(): bool
    {
        return match ($this) {
            self::PAID, self::CANCELED, self::REFUNDED => true,
            self::PENDING => false,
        };
    }
}
