<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table): void {
            // 紐づく Order の内部 ID。1 Order : N Transaction (再決済対応)。
            // 既存行が無い段階で導入するため not null で OK。
            $table->string('order_id', 30)->after('id');
            $table->foreign('order_id')
                ->references('id')->on('orders')
                ->restrictOnDelete();
            $table->index('order_id');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table): void {
            $table->dropForeign(['order_id']);
            $table->dropIndex(['order_id']);
            $table->dropColumn('order_id');
        });
    }
};
