<?php

declare(strict_types=1);

namespace Tests\Unit\Enums;

use App\Enums\ConfirmationFlow;
use PHPUnit\Framework\TestCase;

final class ConfirmationFlowTest extends TestCase
{
    public function test_string_values(): void
    {
        $this->assertSame('client_sdk', ConfirmationFlow::CLIENT_SDK->value);
        $this->assertSame('server_redirect', ConfirmationFlow::SERVER_REDIRECT->value);
    }

    public function test_from_string_round_trip(): void
    {
        foreach (ConfirmationFlow::cases() as $case) {
            $this->assertSame($case, ConfirmationFlow::from($case->value));
        }
    }

    public function test_client_sdk_does_not_require_return_url(): void
    {
        $this->assertFalse(ConfirmationFlow::CLIENT_SDK->requiresReturnUrl());
    }

    public function test_server_redirect_requires_return_url(): void
    {
        $this->assertTrue(ConfirmationFlow::SERVER_REDIRECT->requiresReturnUrl());
    }
}
