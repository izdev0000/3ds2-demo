<?php

declare(strict_types=1);

namespace App\DTO;

/**
 * POST /api/payments のリクエスト。
 *
 * @see docs/api-contract.yaml CreatePaymentRequest
 */
final readonly class CreatePaymentRequest
{
    public function __construct(
        public int $amount,
        public string $currency,
        public ?string $returnUrl = null,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public static function fromArray(array $data): self
    {
        return new self(
            amount: (int) $data['amount'],
            currency: strtolower((string) $data['currency']),
            returnUrl: isset($data['return_url']) ? (string) $data['return_url'] : null,
        );
    }
}
