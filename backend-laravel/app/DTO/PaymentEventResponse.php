<?php

declare(strict_types=1);

namespace App\DTO;

use App\Models\WebhookEvent;
use DateTimeImmutable;

/**
 * `GET /api/payments/{id}/events` 個別要素のレスポンス DTO。
 *
 * @see docs/api-contract.yaml PaymentEvent
 */
final readonly class PaymentEventResponse
{
    public function __construct(
        public string $id,
        public string $pspEventId,
        public string $eventType,
        public ?string $paymentIntentId,
        public DateTimeImmutable $receivedAt,
        public ?DateTimeImmutable $processedAt,
    ) {}

    public static function fromModel(WebhookEvent $event): self
    {
        return new self(
            id: $event->id,
            pspEventId: $event->psp_event_id,
            eventType: $event->event_type,
            paymentIntentId: $event->transaction_id,
            receivedAt: DateTimeImmutable::createFromInterface($event->received_at),
            processedAt: $event->processed_at !== null
                ? DateTimeImmutable::createFromInterface($event->processed_at)
                : null,
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'psp_event_id' => $this->pspEventId,
            'event_type' => $this->eventType,
            'payment_intent_id' => $this->paymentIntentId,
            'received_at' => $this->receivedAt->format(DATE_ATOM),
            'processed_at' => $this->processedAt?->format(DATE_ATOM),
        ];
    }
}
