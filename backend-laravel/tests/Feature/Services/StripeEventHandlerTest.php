<?php

declare(strict_types=1);

namespace Tests\Feature\Services;

use App\Enums\PaymentStatus;
use App\Models\Transaction;
use App\Services\StripeEventHandler;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class StripeEventHandlerTest extends TestCase
{
    use RefreshDatabase;

    private StripeEventHandler $handler;

    protected function setUp(): void
    {
        parent::setUp();
        $this->handler = new StripeEventHandler;
    }

    public function test_payment_intent_succeeded_updates_status_to_succeeded(): void
    {
        $this->createTransaction('txn_test_succeed', PaymentStatus::REQUIRES_ACTION, [
            'next_action' => ['type' => 'use_stripe_sdk'],
        ]);

        $result = $this->handler->handle($this->paymentIntentEvent(
            type: 'payment_intent.succeeded',
            internalId: 'txn_test_succeed',
            stripePaymentIntentId: 'pi_test',
            status: 'succeeded',
            nextAction: null,
        ));

        $this->assertSame('txn_test_succeed', $result);
        $tx = Transaction::query()->findOrFail('txn_test_succeed');
        $this->assertSame(PaymentStatus::SUCCEEDED, $tx->status);
        $this->assertNull($tx->next_action);
    }

    public function test_payment_intent_requires_action_updates_status_and_next_action(): void
    {
        $this->createTransaction('txn_test_action', PaymentStatus::REQUIRES_PAYMENT_METHOD);

        $nextAction = [
            'type' => 'use_stripe_sdk',
            'use_stripe_sdk' => ['type' => 'three_d_secure_redirect'],
        ];

        $result = $this->handler->handle($this->paymentIntentEvent(
            type: 'payment_intent.requires_action',
            internalId: 'txn_test_action',
            stripePaymentIntentId: 'pi_test',
            status: 'requires_action',
            nextAction: $nextAction,
        ));

        $this->assertSame('txn_test_action', $result);
        $tx = Transaction::query()->findOrFail('txn_test_action');
        $this->assertSame(PaymentStatus::REQUIRES_ACTION, $tx->status);
        $this->assertSame($nextAction, $tx->next_action);
    }

    public function test_payment_intent_payment_failed_updates_status(): void
    {
        $this->createTransaction('txn_test_failed', PaymentStatus::REQUIRES_ACTION);

        $result = $this->handler->handle($this->paymentIntentEvent(
            type: 'payment_intent.payment_failed',
            internalId: 'txn_test_failed',
            stripePaymentIntentId: 'pi_test',
            status: 'requires_payment_method', // Stripe は失敗時 requires_payment_method に戻す
        ));

        $this->assertSame('txn_test_failed', $result);
        $tx = Transaction::query()->findOrFail('txn_test_failed');
        $this->assertSame(PaymentStatus::REQUIRES_PAYMENT_METHOD, $tx->status);
    }

    public function test_unknown_internal_transaction_id_returns_null_no_op(): void
    {
        // Transaction を作らずに event を投げる。
        $result = $this->handler->handle($this->paymentIntentEvent(
            type: 'payment_intent.succeeded',
            internalId: 'txn_does_not_exist',
            stripePaymentIntentId: 'pi_test',
            status: 'succeeded',
        ));

        $this->assertNull($result);
        $this->assertSame(0, Transaction::query()->count());
    }

    public function test_event_without_metadata_internal_id_returns_null_no_op(): void
    {
        $this->createTransaction('txn_unaffected', PaymentStatus::REQUIRES_ACTION);

        $event = [
            'id' => 'evt_test',
            'type' => 'payment_intent.succeeded',
            'data' => [
                'object' => [
                    'id' => 'pi_test',
                    'status' => 'succeeded',
                    'metadata' => [], // internal_transaction_id 欠如
                ],
            ],
        ];

        $result = $this->handler->handle($event);

        $this->assertNull($result);
        // 既存 Transaction が変更されていないことを保証
        $tx = Transaction::query()->findOrFail('txn_unaffected');
        $this->assertSame(PaymentStatus::REQUIRES_ACTION, $tx->status);
    }

    public function test_non_payment_intent_event_is_no_op(): void
    {
        $this->createTransaction('txn_unaffected', PaymentStatus::REQUIRES_ACTION);

        $event = [
            'id' => 'evt_dispute',
            'type' => 'charge.dispute.created',
            'data' => [
                'object' => [
                    'id' => 'dp_test',
                ],
            ],
        ];

        $result = $this->handler->handle($event);

        $this->assertNull($result);
        $tx = Transaction::query()->findOrFail('txn_unaffected');
        $this->assertSame(PaymentStatus::REQUIRES_ACTION, $tx->status);
    }

    public function test_event_with_non_array_data_object_returns_null(): void
    {
        $event = [
            'id' => 'evt_invalid',
            'type' => 'payment_intent.succeeded',
            'data' => [], // object 欠如
        ];

        $this->assertNull($this->handler->handle($event));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createTransaction(string $id, PaymentStatus $status, array $overrides = []): Transaction
    {
        return Transaction::create(array_merge([
            'id' => $id,
            'psp' => 'stripe',
            'psp_payment_intent_id' => 'pi_'.$id,
            'client_secret' => 'cs_'.$id,
            'status' => $status,
            'amount' => 1000,
            'currency' => 'jpy',
            'next_action' => null,
            'metadata' => null,
        ], $overrides));
    }

    /**
     * @param  array<string, mixed>|null  $nextAction
     * @return array<string, mixed>
     */
    private function paymentIntentEvent(
        string $type,
        string $internalId,
        string $stripePaymentIntentId,
        string $status,
        ?array $nextAction = null,
    ): array {
        return [
            'id' => 'evt_'.$internalId,
            'type' => $type,
            'data' => [
                'object' => [
                    'id' => $stripePaymentIntentId,
                    'status' => $status,
                    'next_action' => $nextAction,
                    'metadata' => [
                        'internal_transaction_id' => $internalId,
                    ],
                ],
            ],
        ];
    }
}
