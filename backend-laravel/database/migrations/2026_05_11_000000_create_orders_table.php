<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table): void {
            // 内部 order ID。形式: "ord_" + ULID (例: ord_01HYZ80012345...)
            $table->string('id', 30)->primary();

            // App\Enums\OrderStatus と整合する文字列
            $table->string('status', 32)->index();

            // items の合計金額 (quantity * unit_price の総和)。
            // 真値は order_items 側の集計だが、参照高速化のため Order 側にも持つ。
            $table->unsignedBigInteger('amount');

            // ISO 4217 通貨コード (小文字)
            $table->string('currency', 3);

            // 任意の業務メタデータ
            $table->json('metadata')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
