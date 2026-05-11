<?php

declare(strict_types=1);

namespace App\DTO;

/**
 * POST /api/payments のリクエスト。
 *
 * amount / currency は紐づく Order から導出するため、ここでは指定しない
 * (client 側で改竄できないようにする)。
 *
 * @see docs/api-contract.yaml CreatePaymentRequest
 */
final readonly class CreatePaymentRequest
{
    public function __construct(
        public string $orderId,
        public ?string $returnUrl = null,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public static function fromArray(array $data): self
    {
        return new self(
            orderId: (string) $data['order_id'],
            returnUrl: isset($data['return_url']) ? (string) $data['return_url'] : null,
        );
    }
}
