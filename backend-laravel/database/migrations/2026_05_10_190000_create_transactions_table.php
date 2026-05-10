<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactions', function (Blueprint $table): void {
            // 内部 transaction ID。形式: "txn_" + ULID (例: txn_01HYZ80012345...)
            $table->string('id', 30)->primary();

            // PSP 識別子 (stripe / adyen 等、Adapter 切替の判別用)
            $table->string('psp', 32)->index();

            // PSP 側の PaymentIntent ID (Stripe なら pi_...、Adyen なら pspReference 相当)
            $table->string('psp_payment_intent_id')->nullable()->index();

            // Stripe.js 等で frontend が confirm するための client_secret
            $table->string('client_secret')->nullable();

            // App\Enums\PaymentStatus と整合する文字列
            $table->string('status', 32)->index();

            // 通貨の最小単位 (JPY なら円、USD ならセント)
            $table->unsignedBigInteger('amount');

            // ISO 4217 通貨コード (小文字)
            $table->string('currency', 3);

            // 3DS2 challenge など frontend で追加処理が必要な情報
            $table->json('next_action')->nullable();

            // 業務メタデータ (任意)
            $table->json('metadata')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};
