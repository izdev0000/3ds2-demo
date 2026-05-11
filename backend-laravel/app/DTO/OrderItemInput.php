<?php

declare(strict_types=1);

namespace App\DTO;

final readonly class OrderItemInput
{
    public function __construct(
        public string $name,
        public int $quantity,
        public int $unitPrice,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public static function fromArray(array $data): self
    {
        return new self(
            name: (string) ($data['name'] ?? ''),
            quantity: (int) ($data['quantity'] ?? 0),
            unitPrice: (int) ($data['unit_price'] ?? 0),
        );
    }
}
