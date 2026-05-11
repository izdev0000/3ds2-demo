<?php

declare(strict_types=1);

namespace Tests\Unit\DTO;

use App\DTO\CreatePaymentRequest;
use PHPUnit\Framework\TestCase;

final class CreatePaymentRequestTest extends TestCase
{
    public function test_from_array_with_minimum_fields(): void
    {
        $dto = CreatePaymentRequest::fromArray([
            'order_id' => 'ord_01HYZ800',
        ]);

        $this->assertSame('ord_01HYZ800', $dto->orderId);
        $this->assertNull($dto->returnUrl);
    }

    public function test_from_array_with_return_url(): void
    {
        $dto = CreatePaymentRequest::fromArray([
            'order_id' => 'ord_01HYZ801',
            'return_url' => 'http://localhost:5173/payments/return',
        ]);

        $this->assertSame('ord_01HYZ801', $dto->orderId);
        $this->assertSame('http://localhost:5173/payments/return', $dto->returnUrl);
    }
}
