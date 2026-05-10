<?php

declare(strict_types=1);

namespace App\Adapters;

use App\DTO\ConfirmPaymentRequest;
use App\DTO\CreatePaymentRequest;
use App\DTO\PaymentResponse;
use App\Enums\PaymentStatus;
use App\Models\Transaction;
use App\Support\IdGenerator;
use DateTimeImmutable;
use LogicException;
use Stripe\StripeClient;

/**
 * Stripe 用 Adapter。
 *
 * Payment Intents API を使って PaymentIntent の作成・confirm・状態取得を行う。
 * `request_three_d_secure: 'any'` を付与して frictionless / challenge どちらの
 * 経路でも 3DS2 を経由するよう要求する。
 *
 * 実装段階:
 *   - createPayment:           実装済み (Y3-2)
 *   - confirmPayment:          未実装 (Y3-4 で実装)
 *   - getPayment:              未実装 (Y3-4 で実装)
 *   - verifyWebhookSignature:  未実装 (Y3-5 で実装)
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
        $internalId = IdGenerator::transactionId();

        // Stripe で PaymentIntent を作成。
        // request_three_d_secure: 'any' で frictionless / challenge 両経路で 3DS2 を経由させ、
        // 仕様学習デモとして 3DS2 challenge の挙動を観察できるようにする (EMVCo §6.x)。
        $intent = $this->stripe->paymentIntents->create([
            'amount' => $request->amount,
            'currency' => $request->currency,
            'payment_method_types' => ['card'],
            'payment_method_options' => [
                'card' => [
                    'request_three_d_secure' => 'any',
                ],
            ],
            'metadata' => [
                'internal_transaction_id' => $internalId,
            ],
        ]);

        $transaction = Transaction::create([
            'id' => $internalId,
            'psp' => 'stripe',
            'psp_payment_intent_id' => $intent->id,
            'client_secret' => $intent->client_secret,
            'status' => PaymentStatus::from($intent->status),
            'amount' => $request->amount,
            'currency' => $request->currency,
            'next_action' => $intent->next_action?->toArray(),
            'metadata' => $intent->metadata?->toArray(),
        ]);

        return $this->toResponse($transaction);
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

    private function toResponse(Transaction $tx): PaymentResponse
    {
        return new PaymentResponse(
            id: $tx->id,
            stripePaymentIntentId: $tx->psp_payment_intent_id,
            clientSecret: (string) $tx->client_secret,
            status: $tx->status,
            amount: $tx->amount,
            currency: $tx->currency,
            nextAction: $tx->next_action,
            createdAt: DateTimeImmutable::createFromInterface($tx->created_at),
            updatedAt: DateTimeImmutable::createFromInterface($tx->updated_at),
        );
    }

    private function notImplementedYet(string $method): LogicException
    {
        return new LogicException(sprintf(
            'StripeAdapter::%s() is not implemented yet (scaffold only).',
            $method,
        ));
    }
}
