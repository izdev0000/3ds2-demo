<?php

declare(strict_types=1);

namespace App\DTO;

use App\Enums\PaymentStatus;
use DateTimeImmutable;

/**
 * Payment endpoint 共通レスポンス。
 *
 * @see docs/api-contract.yaml PaymentResponse
 */
final readonly class PaymentResponse
{
    /**
     * @param  array<string, mixed>|null  $nextAction
     */
    public function __construct(
        public string $id,
        public ?string $stripePaymentIntentId,
        public string $clientSecret,
        public PaymentStatus $status,
        public int $amount,
        public string $currency,
        public ?array $nextAction,
        public DateTimeImmutable $createdAt,
        public DateTimeImmutable $updatedAt,
    ) {
    }

    /**
     * api-contract.yaml の PaymentResponse スキーマ通りに JSON 変換する。
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'stripe_payment_intent_id' => $this->stripePaymentIntentId,
            'client_secret' => $this->clientSecret,
            'status' => $this->status->value,
            'amount' => $this->amount,
            'currency' => $this->currency,
            'next_action' => $this->nextAction,
            'created_at' => $this->createdAt->format(DATE_ATOM),
            'updated_at' => $this->updatedAt->format(DATE_ATOM),
        ];
    }
}
