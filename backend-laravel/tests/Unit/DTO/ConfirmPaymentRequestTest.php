<?php

declare(strict_types=1);

namespace Tests\Unit\DTO;

use App\DTO\ConfirmPaymentRequest;
use App\Enums\ConfirmationFlow;
use PHPUnit\Framework\TestCase;
use ValueError;

final class ConfirmPaymentRequestTest extends TestCase
{
    public function test_from_array_with_minimum_fields_defaults_flow_to_client_sdk(): void
    {
        $dto = ConfirmPaymentRequest::fromArray([
            'payment_method_id' => 'pm_card_visa',
        ]);

        $this->assertSame('pm_card_visa', $dto->paymentMethodId);
        $this->assertSame(ConfirmationFlow::CLIENT_SDK, $dto->flow);
        $this->assertNull($dto->returnUrl);
    }

    public function test_from_array_with_return_url(): void
    {
        $dto = ConfirmPaymentRequest::fromArray([
            'payment_method_id' => 'pm_test_x',
            'return_url' => 'http://localhost:5173/payments/return',
        ]);

        $this->assertSame('pm_test_x', $dto->paymentMethodId);
        $this->assertSame('http://localhost:5173/payments/return', $dto->returnUrl);
    }

    public function test_from_array_accepts_client_sdk_flow_explicitly(): void
    {
        $dto = ConfirmPaymentRequest::fromArray([
            'payment_method_id' => 'pm_card_visa',
            'flow' => 'client_sdk',
        ]);

        $this->assertSame(ConfirmationFlow::CLIENT_SDK, $dto->flow);
    }

    public function test_from_array_accepts_server_redirect_flow_with_return_url(): void
    {
        $dto = ConfirmPaymentRequest::fromArray([
            'payment_method_id' => 'pm_card_visa',
            'flow' => 'server_redirect',
            'return_url' => 'http://localhost:5173/payments/return',
        ]);

        $this->assertSame(ConfirmationFlow::SERVER_REDIRECT, $dto->flow);
        $this->assertSame('http://localhost:5173/payments/return', $dto->returnUrl);
    }

    public function test_from_array_invalid_flow_value_throws(): void
    {
        $this->expectException(ValueError::class);

        ConfirmPaymentRequest::fromArray([
            'payment_method_id' => 'pm_card_visa',
            'flow' => 'unknown_flow',
        ]);
    }
}
