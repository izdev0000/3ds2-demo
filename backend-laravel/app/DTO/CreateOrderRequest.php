<?php

declare(strict_types=1);

namespace App\DTO;

/**
 * POST /api/orders のリクエスト。
 *
 * @see docs/api-contract.yaml CreateOrderRequest
 */
final readonly class CreateOrderRequest
{
    /**
     * @param  list<OrderItemInput>  $items
     * @param  array<string, mixed>|null  $metadata
     */
    public function __construct(
        public string $currency,
        public array $items,
        public ?array $metadata = null,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public static function fromArray(array $data): self
    {
        $itemsRaw = $data['items'] ?? [];
        $items = [];
        foreach ((array) $itemsRaw as $row) {
            if (! is_array($row)) {
                continue;
            }
            $items[] = OrderItemInput::fromArray($row);
        }

        return new self(
            currency: strtolower((string) $data['currency']),
            items: $items,
            metadata: isset($data['metadata']) && is_array($data['metadata']) ? $data['metadata'] : null,
        );
    }

    public function totalAmount(): int
    {
        $sum = 0;
        foreach ($this->items as $item) {
            $sum += $item->quantity * $item->unitPrice;
        }

        return $sum;
    }
}
