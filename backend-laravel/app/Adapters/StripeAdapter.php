<?php

declare(strict_types=1);

namespace App\Adapters;

use App\DTO\ConfirmPaymentRequest;
use App\DTO\CreatePaymentRequest;
use App\DTO\PaymentResponse;
use LogicException;
use Stripe\StripeClient;

/**
 * Stripe 用 Adapter。
 *
 * Payment Intents API を使って PaymentIntent の作成・confirm・状態取得を行う。
 * `request_three_d_secure: 'any'` を付与して frictionless / challenge どちらの
 * 経路でも 3DS2 を経由するよう要求する。
 *
 * 本クラスはスケルトンのみ。実装は Phase 4 後半 (Y3) で行う。
 */
final class StripeAdapter implements PaymentAdapterInterface
{
    public function __construct(
        private readonly StripeClient $stripe,
        private readonly string $webhookSecret,
    ) {
    }

    public function createPayment(CreatePaymentRequest $request): PaymentResponse
    {
        throw $this->notImplementedYet(__FUNCTION__);
    }

    public function confirmPayment(string $id, ConfirmPaymentRequest $request): PaymentResponse
    {
        throw $this->notImplementedYet(__FUNCTION__);
    }

    public function getPayment(string $id): PaymentResponse
    {
        throw $this->notImplementedYet(__FUNCTION__);
    }

    public function verifyWebhookSignature(string $payload, string $signature): void
    {
        throw $this->notImplementedYet(__FUNCTION__);
    }

    private function notImplementedYet(string $method): LogicException
    {
        return new LogicException(sprintf(
            'StripeAdapter::%s() is not implemented yet (scaffold only).',
            $method,
        ));
    }
}
