<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Support\IdGenerator;
use PHPUnit\Framework\TestCase;

final class IdGeneratorTest extends TestCase
{
    public function test_transaction_id_has_txn_prefix(): void
    {
        $this->assertStringStartsWith('txn_', IdGenerator::transactionId());
    }

    public function test_webhook_event_id_has_evt_prefix(): void
    {
        $this->assertStringStartsWith('evt_', IdGenerator::webhookEventId());
    }

    public function test_transaction_id_total_length_is_30_chars(): void
    {
        // "txn_" (4) + ULID (26) = 30
        $this->assertSame(30, strlen(IdGenerator::transactionId()));
    }

    public function test_webhook_event_id_total_length_is_30_chars(): void
    {
        // "evt_" (4) + ULID (26) = 30
        $this->assertSame(30, strlen(IdGenerator::webhookEventId()));
    }

    public function test_ulid_part_is_crockford_base32(): void
    {
        // ULID は Crockford Base32 (I, L, O, U を除く 32 文字) で構成される。
        $ulid = substr(IdGenerator::transactionId(), 4);
        $this->assertMatchesRegularExpression('/^[0-9A-HJKMNP-TV-Z]{26}$/', $ulid);
    }

    public function test_consecutive_transaction_ids_are_unique(): void
    {
        $ids = [];
        for ($i = 0; $i < 100; $i++) {
            $ids[] = IdGenerator::transactionId();
        }
        $this->assertCount(100, array_unique($ids));
    }

    public function test_consecutive_webhook_event_ids_are_unique(): void
    {
        $ids = [];
        for ($i = 0; $i < 100; $i++) {
            $ids[] = IdGenerator::webhookEventId();
        }
        $this->assertCount(100, array_unique($ids));
    }
}
