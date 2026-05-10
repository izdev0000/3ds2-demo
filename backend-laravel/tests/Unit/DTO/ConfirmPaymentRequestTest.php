<?php

declare(strict_types=1);

namespace Tests\Unit\DTO;

use App\DTO\ConfirmPaymentRequest;
use PHPUnit\Framework\TestCase;

final class ConfirmPaymentRequestTest extends TestCase
{
    public function test_from_array_with_minimum_fields(): void
    {
        $dto = ConfirmPaymentRequest::fromArray([
            'payment_method_id' => 'pm_card_visa',
        ]);

        $this->assertSame('pm_card_visa', $dto->paymentMethodId);
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
}
