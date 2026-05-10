<?php

declare(strict_types=1);

namespace App\Adapters;

use App\DTO\ConfirmPaymentRequest;
use App\DTO\CreatePaymentRequest;
use App\DTO\PaymentResponse;

/**
 * PSP 抽象化レイヤ。
 *
 * Stripe / Adyen 等の異なる PSP を同一 interface で扱う。
 * 本契約は docs/api-contract.yaml の Payment endpoints と整合する。
 *
 * 実装は Service Container で
 * App\Adapters\PaymentAdapterInterface → 採用 PSP の Adapter
 * にバインドする。
 */
interface PaymentAdapterInterface
{
    /**
     * PaymentIntent を作成する。3DS2 challenge をなるべく経由するよう
     * 各 Adapter 実装側で `request_three_d_secure: 'any'` 相当を付与する。
     */
    public function createPayment(CreatePaymentRequest $request): PaymentResponse;

    /**
     * PaymentIntent を confirm する。3DS2 challenge が必要な場合は
     * PaymentResponse の status が REQUIRES_ACTION になり、nextAction
     * に challenge 詳細が入る。
     */
    public function confirmPayment(string $id, ConfirmPaymentRequest $request): PaymentResponse;

    /**
     * PaymentIntent の現在状態を取得する。
     */
    public function getPayment(string $id): PaymentResponse;

    /**
     * Webhook 署名を検証する。検証失敗時は例外を投げる。
     *
     * @param  string  $payload  raw リクエストボディ (Stripe は raw payload を必要とする)
     * @param  string  $signature  PSP 固有の署名ヘッダ値 (Stripe なら Stripe-Signature)
     *
     * @throws \RuntimeException 検証失敗時 (各 Adapter は固有例外でラップしてもよい)
     */
    public function verifyWebhookSignature(string $payload, string $signature): void;
}
