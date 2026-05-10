<?php

declare(strict_types=1);

namespace Tests\Unit\Enums;

use App\Enums\PaymentStatus;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class PaymentStatusTest extends TestCase
{
    /**
     * @return array<string, array{PaymentStatus, bool}>
     */
    public static function isTerminalProvider(): array
    {
        return [
            'requires_payment_method' => [PaymentStatus::REQUIRES_PAYMENT_METHOD, false],
            'requires_confirmation' => [PaymentStatus::REQUIRES_CONFIRMATION, false],
            'requires_action' => [PaymentStatus::REQUIRES_ACTION, false],
            'processing' => [PaymentStatus::PROCESSING, false],
            'requires_capture' => [PaymentStatus::REQUIRES_CAPTURE, false],
            'canceled' => [PaymentStatus::CANCELED, true],
            'succeeded' => [PaymentStatus::SUCCEEDED, true],
        ];
    }

    #[DataProvider('isTerminalProvider')]
    public function test_is_terminal(PaymentStatus $status, bool $expected): void
    {
        $this->assertSame($expected, $status->isTerminal());
    }

    /**
     * @return array<string, array{PaymentStatus, bool}>
     */
    public static function requiresClientActionProvider(): array
    {
        return [
            'requires_action' => [PaymentStatus::REQUIRES_ACTION, true],
            'requires_payment_method' => [PaymentStatus::REQUIRES_PAYMENT_METHOD, false],
            'requires_confirmation' => [PaymentStatus::REQUIRES_CONFIRMATION, false],
            'processing' => [PaymentStatus::PROCESSING, false],
            'requires_capture' => [PaymentStatus::REQUIRES_CAPTURE, false],
            'canceled' => [PaymentStatus::CANCELED, false],
            'succeeded' => [PaymentStatus::SUCCEEDED, false],
        ];
    }

    #[DataProvider('requiresClientActionProvider')]
    public function test_requires_client_action(PaymentStatus $status, bool $expected): void
    {
        $this->assertSame($expected, $status->requiresClientAction());
    }

    public function test_string_values_match_stripe_payment_intent_states(): void
    {
        // Stripe Payment Intent の status と完全一致していることを保証する。
        // 不一致だと PaymentStatus::from() が webhook 受信時に失敗する。
        $this->assertSame('requires_payment_method', PaymentStatus::REQUIRES_PAYMENT_METHOD->value);
        $this->assertSame('requires_confirmation', PaymentStatus::REQUIRES_CONFIRMATION->value);
        $this->assertSame('requires_action', PaymentStatus::REQUIRES_ACTION->value);
        $this->assertSame('processing', PaymentStatus::PROCESSING->value);
        $this->assertSame('requires_capture', PaymentStatus::REQUIRES_CAPTURE->value);
        $this->assertSame('canceled', PaymentStatus::CANCELED->value);
        $this->assertSame('succeeded', PaymentStatus::SUCCEEDED->value);
    }

    public function test_from_string_round_trip(): void
    {
        foreach (PaymentStatus::cases() as $case) {
            $this->assertSame($case, PaymentStatus::from($case->value));
        }
    }
}
