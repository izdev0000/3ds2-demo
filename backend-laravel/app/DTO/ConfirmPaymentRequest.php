<?php

declare(strict_types=1);

namespace App\DTO;

use App\Enums\ConfirmationFlow;

/**
 * POST /api/payments/{id}/confirm のリクエスト。
 *
 * @see docs/api-contract.yaml ConfirmPaymentRequest
 */
final readonly class ConfirmPaymentRequest
{
    public function __construct(
        public string $paymentMethodId,
        public ConfirmationFlow $flow = ConfirmationFlow::CLIENT_SDK,
        public ?string $returnUrl = null,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public static function fromArray(array $data): self
    {
        return new self(
            paymentMethodId: (string) $data['payment_method_id'],
            flow: isset($data['flow'])
                ? ConfirmationFlow::from((string) $data['flow'])
                : ConfirmationFlow::CLIENT_SDK,
            returnUrl: isset($data['return_url']) ? (string) $data['return_url'] : null,
        );
    }
}
