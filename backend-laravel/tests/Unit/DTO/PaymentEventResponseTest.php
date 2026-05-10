<?php

declare(strict_types=1);

namespace Tests\Unit\DTO;

use App\DTO\PaymentEventResponse;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

final class PaymentEventResponseTest extends TestCase
{
    public function test_to_array_outputs_snake_case_keys_per_contract(): void
    {
        $receivedAt = new DateTimeImmutable('2026-05-10T12:00:00+00:00');
        $processedAt = new DateTimeImmutable('2026-05-10T12:00:01+00:00');

        $dto = new PaymentEventResponse(
            id: 'evt_01HYZ900',
            pspEventId: 'evt_3RT0',
            eventType: 'payment_intent.succeeded',
            paymentIntentId: 'txn_01HYZ800',
            receivedAt: $receivedAt,
            processedAt: $processedAt,
        );

        $this->assertSame([
            'id' => 'evt_01HYZ900',
            'psp_event_id' => 'evt_3RT0',
            'event_type' => 'payment_intent.succeeded',
            'payment_intent_id' => 'txn_01HYZ800',
            'received_at' => '2026-05-10T12:00:00+00:00',
            'processed_at' => '2026-05-10T12:00:01+00:00',
        ], $dto->toArray());
    }

    public function test_null_processed_at_and_payment_intent_id_render_null(): void
    {
        $dto = new PaymentEventResponse(
            id: 'evt_01HYZ900',
            pspEventId: 'evt_3RT0',
            eventType: 'payment_intent.succeeded',
            paymentIntentId: null,
            receivedAt: new DateTimeImmutable('2026-05-10T12:00:00+00:00'),
            processedAt: null,
        );

        $array = $dto->toArray();
        $this->assertNull($array['processed_at']);
        $this->assertNull($array['payment_intent_id']);
    }
}
