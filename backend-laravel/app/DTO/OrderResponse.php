<?php

declare(strict_types=1);

namespace App\DTO;

use App\Enums\OrderStatus;
use App\Models\Order;
use DateTimeImmutable;

/**
 * Order endpoint 共通レスポンス。
 *
 * @see docs/api-contract.yaml OrderResponse
 */
final readonly class OrderResponse
{
    /**
     * @param  list<array<string, mixed>>  $items
     * @param  array<string, mixed>|null  $metadata
     */
    public function __construct(
        public string $id,
        public OrderStatus $status,
        public int $amount,
        public string $currency,
        public array $items,
        public ?array $metadata,
        public DateTimeImmutable $createdAt,
        public DateTimeImmutable $updatedAt,
    ) {}

    public static function fromModel(Order $order): self
    {
        $items = $order->items->map(fn ($item) => [
            'id' => $item->id,
            'name' => $item->name,
            'quantity' => $item->quantity,
            'unit_price' => $item->unit_price,
            'subtotal' => $item->subtotal(),
        ])->values()->all();

        return new self(
            id: $order->id,
            status: $order->status,
            amount: $order->amount,
            currency: $order->currency,
            items: $items,
            metadata: $order->metadata,
            createdAt: DateTimeImmutable::createFromInterface($order->created_at),
            updatedAt: DateTimeImmutable::createFromInterface($order->updated_at),
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'status' => $this->status->value,
            'amount' => $this->amount,
            'currency' => $this->currency,
            'items' => $this->items,
            'metadata' => $this->metadata,
            'created_at' => $this->createdAt->format(DATE_ATOM),
            'updated_at' => $this->updatedAt->format(DATE_ATOM),
        ];
    }
}
