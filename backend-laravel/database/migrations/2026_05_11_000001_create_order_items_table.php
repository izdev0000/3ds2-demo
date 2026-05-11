<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_items', function (Blueprint $table): void {
            // 内部 order item ID。形式: "oit_" + ULID
            $table->string('id', 30)->primary();

            $table->string('order_id', 30);
            $table->foreign('order_id')
                ->references('id')->on('orders')
                ->cascadeOnDelete();

            $table->string('name', 255);
            $table->unsignedInteger('quantity');

            // 通貨の最小単位での単価 (JPY なら円、USD ならセント)
            $table->unsignedBigInteger('unit_price');

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
    }
};
