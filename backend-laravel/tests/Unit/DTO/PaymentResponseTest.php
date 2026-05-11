<?php

declare(strict_types=1);

namespace Tests\Unit\DTO;

use App\DTO\PaymentResponse;
use App\Enums\PaymentStatus;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

final class PaymentResponseTest extends TestCase
{
    public function test_to_array_outputs_snake_case_keys_per_contract(): void
    {
        $createdAt = new DateTimeImmutable('2026-05-10T12:00:00+00:00');
        $updatedAt = new DateTimeImmutable('2026-05-10T12:00:01+00:00');

        $dto = new PaymentResponse(
            id: 'txn_01HYZ800',
            orderId: 'ord_01HYZ800',
            pspPaymentIntentId: 'pi_3RT0',
            clientSecret: 'pi_3RT0_secret_xyz',
            status: PaymentStatus::REQUIRES_ACTION,
            amount: 1000,
            currency: 'jpy',
            nextAction: ['type' => 'use_stripe_sdk'],
            createdAt: $createdAt,
            updatedAt: $updatedAt,
        );

        $this->assertSame([
            'id' => 'txn_01HYZ800',
            'order_id' => 'ord_01HYZ800',
            'psp_payment_intent_id' => 'pi_3RT0',
            'client_secret' => 'pi_3RT0_secret_xyz',
            'status' => 'requires_action',
            'amount' => 1000,
            'currency' => 'jpy',
            'next_action' => ['type' => 'use_stripe_sdk'],
            'created_at' => '2026-05-10T12:00:00+00:00',
            'updated_at' => '2026-05-10T12:00:01+00:00',
        ], $dto->toArray());
    }

    public function test_null_psp_payment_intent_id_and_next_action_render_null(): void
    {
        $dto = new PaymentResponse(
            id: 'txn_01HYZ800',
            orderId: 'ord_01HYZ800',
            pspPaymentIntentId: null,
            clientSecret: 'cs_xxx',
            status: PaymentStatus::SUCCEEDED,
            amount: 1000,
            currency: 'jpy',
            nextAction: null,
            createdAt: new DateTimeImmutable('2026-05-10T12:00:00+00:00'),
            updatedAt: new DateTimeImmutable('2026-05-10T12:00:00+00:00'),
        );

        $array = $dto->toArray();
        $this->assertNull($array['psp_payment_intent_id']);
        $this->assertNull($array['next_action']);
        $this->assertSame('succeeded', $array['status']);
    }
}
