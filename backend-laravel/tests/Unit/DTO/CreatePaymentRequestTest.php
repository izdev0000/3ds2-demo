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
            'amount' => 1000,
            'currency' => 'jpy',
        ]);

        $this->assertSame(1000, $dto->amount);
        $this->assertSame('jpy', $dto->currency);
        $this->assertNull($dto->returnUrl);
    }

    public function test_from_array_with_return_url(): void
    {
        $dto = CreatePaymentRequest::fromArray([
            'amount' => 5000,
            'currency' => 'usd',
            'return_url' => 'http://localhost:5173/payments/return',
        ]);

        $this->assertSame(5000, $dto->amount);
        $this->assertSame('usd', $dto->currency);
        $this->assertSame('http://localhost:5173/payments/return', $dto->returnUrl);
    }

    public function test_currency_is_normalized_to_lowercase(): void
    {
        $dto = CreatePaymentRequest::fromArray([
            'amount' => 1000,
            'currency' => 'JPY',
        ]);

        $this->assertSame('jpy', $dto->currency);
    }

    public function test_amount_is_coerced_to_int(): void
    {
        // フォーム送信から string で来るケースを想定。
        $dto = CreatePaymentRequest::fromArray([
            'amount' => '2500',
            'currency' => 'jpy',
        ]);

        $this->assertSame(2500, $dto->amount);
    }
}
