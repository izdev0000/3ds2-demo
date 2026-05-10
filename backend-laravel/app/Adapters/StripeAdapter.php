<?php

declare(strict_types=1);

namespace App\Adapters;

use App\DTO\ConfirmPaymentRequest;
use App\DTO\CreatePaymentRequest;
use App\DTO\PaymentResponse;
use App\Enums\ConfirmationFlow;
use App\Enums\PaymentStatus;
use App\Models\Transaction;
use App\Support\IdGenerator;
use DateTimeImmutable;
use InvalidArgumentException;
use RuntimeException;
use Stripe\Exception\SignatureVerificationException;
use Stripe\StripeClient;
use Stripe\Webhook;
use UnexpectedValueException;

/**
 * Stripe 用 Adapter。
 *
 * Payment Intents API を使って PaymentIntent の作成・confirm・状態取得を行う。
 * `request_three_d_secure: 'any'` を付与して frictionless / challenge どちらの
 * 経路でも 3DS2 を経由するよう要求する。
 *
 * 実装段階:
 *   - createPayment:           実装済み (Y3-2)
 *   - confirmPayment:          実装済み (Y3-4)
 *   - getPayment:              実装済み (Y3-4)
 *   - verifyWebhookSignature:  実装済み (Y3-5)
 */
final class StripeAdapter implements PaymentAdapterInterface
{
    public function __construct(
        private readonly StripeClient $stripe,
        private readonly string $webhookSecret,
    ) {}

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
            'metadata' => $intent->metadata->toArray(),
        ]);

        return $this->toResponse($transaction);
    }

    public function confirmPayment(string $id, ConfirmPaymentRequest $request, ConfirmationFlow $flow): PaymentResponse
    {
        $transaction = Transaction::query()->findOrFail($id);

        if ($transaction->psp_payment_intent_id === null) {
            throw new RuntimeException(sprintf(
                'Transaction %s has no Stripe PaymentIntent linked.',
                $id,
            ));
        }

        // SERVER_REDIRECT は return_url 必須。CLIENT_SDK は任意で渡してよい。
        if ($flow->requiresReturnUrl() && $request->returnUrl === null) {
            throw new InvalidArgumentException(sprintf(
                'ConfirmationFlow::%s requires a return_url.',
                $flow->name,
            ));
        }

        $params = ['payment_method' => $request->paymentMethodId];
        if ($request->returnUrl !== null) {
            $params['return_url'] = $request->returnUrl;
        }

        // 使った flow を Transaction の metadata にも記録 (監査・障害調査用)。
        $metadata = $transaction->metadata ?? [];
        $metadata['confirmation_flow'] = $flow->value;

        // Stripe で confirm。3DS2 が必要なら status='requires_action' + next_action が返る。
        $intent = $this->stripe->paymentIntents->confirm(
            $transaction->psp_payment_intent_id,
            $params,
        );

        $transaction->status = PaymentStatus::from($intent->status);
        $transaction->next_action = $intent->next_action?->toArray();
        $transaction->metadata = $metadata;
        $transaction->save();

        return $this->toResponse($transaction);
    }

    public function getPayment(string $id): PaymentResponse
    {
        // DB をソースオブトゥルースとして扱う。webhook が status 同期を担保。
        $transaction = Transaction::query()->findOrFail($id);

        return $this->toResponse($transaction);
    }

    public function verifyWebhookSignature(string $payload, string $signature): array
    {
        try {
            // Stripe SDK が timestamp 検査込みで HMAC-SHA256 を検証し、
            // 検証成功時に Stripe\Event を返す。失敗時は例外を投げる。
            $event = Webhook::constructEvent($payload, $signature, $this->webhookSecret);
        } catch (SignatureVerificationException $e) {
            throw new RuntimeException(
                'Stripe webhook signature verification failed: '.$e->getMessage(),
                previous: $e,
            );
        } catch (UnexpectedValueException $e) {
            // payload が JSON として parse 不能
            throw new RuntimeException(
                'Stripe webhook payload is invalid JSON: '.$e->getMessage(),
                previous: $e,
            );
        }

        return $event->toArray();
    }

    private function toResponse(Transaction $tx): PaymentResponse
    {
        return new PaymentResponse(
            id: $tx->id,
            pspPaymentIntentId: $tx->psp_payment_intent_id,
            clientSecret: (string) $tx->client_secret,
            status: $tx->status,
            amount: $tx->amount,
            currency: $tx->currency,
            nextAction: $tx->next_action,
            createdAt: DateTimeImmutable::createFromInterface($tx->created_at),
            updatedAt: DateTimeImmutable::createFromInterface($tx->updated_at),
        );
    }
}
