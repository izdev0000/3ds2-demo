<?php

declare(strict_types=1);

namespace App\Adapters;

use App\DTO\ConfirmPaymentRequest;
use App\DTO\CreatePaymentRequest;
use App\DTO\PaymentResponse;
use App\Enums\ConfirmationFlow;

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
     *
     * $flow で confirmation 経路を指定する:
     * - CLIENT_SDK: frontend SDK が iframe で challenge を扱う想定。return_url は任意。
     * - SERVER_REDIRECT: backend が return_url を Stripe に渡し、frontend は
     *   返却された redirect URL へ画面遷移する想定。return_url は必須。
     *
     * 設計詳細は docs/design/confirmation-flow.md 参照。
     */
    public function confirmPayment(string $id, ConfirmPaymentRequest $request, ConfirmationFlow $flow): PaymentResponse;

    /**
     * PaymentIntent の現在状態を取得する。
     */
    public function getPayment(string $id): PaymentResponse;

    /**
     * Webhook 署名を検証し、parse 済み event payload を array で返す。
     *
     * 検証は各 PSP 固有のアルゴリズム (Stripe なら HMAC-SHA256 + timestamp 検査)。
     * 検証成功時のみ payload を array へ展開して返却する。Controller は
     * 戻り値を idempotency 検査と State Machine 遷移にそのまま使える。
     *
     * @param  string  $payload  raw リクエストボディ (Stripe は raw payload を必要とする)
     * @param  string  $signature  PSP 固有の署名ヘッダ値 (Stripe なら Stripe-Signature)
     * @return array<string, mixed> parse 済み event payload
     *
     * @throws \RuntimeException 検証失敗 / payload 不正時 (各 Adapter は固有例外でラップしてもよい)
     */
    public function verifyWebhookSignature(string $payload, string $signature): array;
}
