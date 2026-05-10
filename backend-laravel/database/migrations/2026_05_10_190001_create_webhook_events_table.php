<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('webhook_events', function (Blueprint $table): void {
            // 内部 event ID。形式: "evt_" + ULID
            $table->string('id', 30)->primary();

            $table->string('psp', 32)->index();

            // PSP 側の event ID。idempotency 検証 (同じ event を複数回処理しない) で使う
            $table->string('psp_event_id')->index();

            $table->string('event_type')->index();

            // 紐づく transaction (PaymentIntent と関連しない event は null)
            $table->string('transaction_id', 30)->nullable()->index();

            // 受信した raw payload (Stripe Event オブジェクト等)
            $table->json('payload');

            $table->timestamp('received_at');
            $table->timestamp('processed_at')->nullable();

            $table->timestamps();

            // 同一 PSP の同一 event は 1 回しか登録できない (idempotency)
            $table->unique(['psp', 'psp_event_id']);

            $table->foreign('transaction_id')
                ->references('id')
                ->on('transactions')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('webhook_events');
    }
};
