<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Payment Intent の状態。
 *
 * Stripe Payment Intent の status と一致させ、内部 State Machine と
 * docs/api-contract.yaml の PaymentStatus enum と整合する。
 *
 * EMVCo 3DS2 メッセージフロー (AReq → ARes → CReq → CRes) との対応:
 *
 * | case                   | EMVCo フェーズ                 |
 * | ---------------------- | ------------------------------ |
 * | REQUIRES_PAYMENT_METHOD| 未送信                         |
 * | REQUIRES_CONFIRMATION  | AReq 送信直前                  |
 * | REQUIRES_ACTION        | ARes / CReq (3DS2 challenge 中) |
 * | PROCESSING             | CRes 後の processing           |
 * | REQUIRES_CAPTURE       | 認証成功 (manual capture 時)   |
 * | SUCCEEDED              | 認証成功 + 売上確定            |
 * | CANCELED               | キャンセル                     |
 */
enum PaymentStatus: string
{
    case REQUIRES_PAYMENT_METHOD = 'requires_payment_method';
    case REQUIRES_CONFIRMATION = 'requires_confirmation';
    case REQUIRES_ACTION = 'requires_action';
    case PROCESSING = 'processing';
    case REQUIRES_CAPTURE = 'requires_capture';
    case CANCELED = 'canceled';
    case SUCCEEDED = 'succeeded';

    public function isTerminal(): bool
    {
        return match ($this) {
            self::SUCCEEDED, self::CANCELED => true,
            default => false,
        };
    }

    public function requiresClientAction(): bool
    {
        return $this === self::REQUIRES_ACTION;
    }
}
