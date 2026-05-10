<?php

declare(strict_types=1);

namespace App\Adapters;

use App\DTO\ConfirmPaymentRequest;
use App\DTO\CreatePaymentRequest;
use App\DTO\PaymentResponse;
use App\Enums\ConfirmationFlow;
use LogicException;

/**
 * Adyen 用 Adapter のスタブ。
 *
 * 本リポジトリでは PSP として Stripe を採用しており、Adyen は実装しない。
 * 「Adapter パターンを採用しているため別 PSP も差し替え可能」という設計を
 * 示すためのスタブクラス。すべてのメソッドは LogicException を投げる。
 */
final class AdyenAdapter implements PaymentAdapterInterface
{
    public function createPayment(CreatePaymentRequest $request): PaymentResponse
    {
        throw $this->stubException(__FUNCTION__);
    }

    public function confirmPayment(string $id, ConfirmPaymentRequest $request, ConfirmationFlow $flow): PaymentResponse
    {
        throw $this->stubException(__FUNCTION__);
    }

    public function getPayment(string $id): PaymentResponse
    {
        throw $this->stubException(__FUNCTION__);
    }

    public function verifyWebhookSignature(string $payload, string $signature): array
    {
        throw $this->stubException(__FUNCTION__);
    }

    private function stubException(string $method): LogicException
    {
        return new LogicException(sprintf(
            'AdyenAdapter::%s() is intentionally a stub; Adyen PSP is not implemented in this demo.',
            $method,
        ));
    }
}
