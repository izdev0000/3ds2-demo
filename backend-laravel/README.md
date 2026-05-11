# 3ds2-demo / backend-laravel

EMV 3-D Secure 2.x 統合学習デモの **backend**。PHP 8.3 + Laravel 12 +
Stripe PHP SDK。Order 駆動 + webhook 真値遷移の dual-write 設計を実装する。

セットアップ・docker 起動・Stripe key の取り回しなど **環境構築は
[root README](../README.md) を参照**。本 README は backend 内部の
構造とエンドポイントのみ扱う。

## ディレクトリ

```
app/
├── Adapters/                  # PSP 抽象化レイヤ
│   ├── PaymentAdapterInterface.php
│   └── StripeAdapter.php      # createPayment / confirmPayment / verifyWebhookSignature
├── DTO/                       # Request / Response 用 readonly DTO
│   ├── CreateOrderRequest.php
│   ├── CreatePaymentRequest.php
│   ├── ConfirmPaymentRequest.php
│   ├── OrderItemInput.php
│   ├── OrderResponse.php
│   ├── PaymentEventResponse.php
│   └── PaymentResponse.php
├── Enums/
│   ├── ConfirmationFlow.php   # client_sdk / server_redirect
│   ├── OrderStatus.php        # pending / paid / canceled / refunded
│   └── PaymentStatus.php      # Stripe PaymentIntent status と一致
├── Http/Controllers/Api/
│   ├── OrderController.php    # POST /api/orders, GET /api/orders/{id}
│   ├── PaymentController.php  # POST /api/payments, GET, POST /confirm, GET /events
│   ├── WebhookController.php  # POST /api/webhooks/stripe
│   └── DebugController.php    # GET /api/_debug/recent-rows (教育デモ用)
├── Models/                    # Order / OrderItem / Transaction / WebhookEvent
├── Services/
│   └── StripeEventHandler.php # webhook event を Transaction + Order に反映
└── Support/
    └── IdGenerator.php        # ord_/oit_/txn_/evt_ + ULID
```

## エンドポイント一覧

| Method | Path | 役割 |
| --- | --- | --- |
| `POST` | `/api/orders` | 仮注文を作成（`pending` で INSERT） |
| `GET` | `/api/orders/{id}` | Order 状態取得 |
| `POST` | `/api/payments` | 既存 Order に対する PaymentIntent 作成（`order_id` 必須）|
| `GET` | `/api/payments/{id}` | Transaction 状態取得 |
| `POST` | `/api/payments/{id}/confirm` | confirm（client_sdk / server_redirect）|
| `GET` | `/api/payments/{id}/events` | 紐づく webhook 履歴 |
| `POST` | `/api/webhooks/stripe` | Stripe webhook 受信（HMAC 署名検証）|
| `GET` | `/api/_debug/recent-rows` | 各テーブル最新 5 行（教育デモ用）|

完全な契約は [`../docs/api-contract.yaml`](../docs/api-contract.yaml) を参照。

## データモデルと設計の核

- **`orders`** / **`order_items`** / **`transactions`** / **`webhook_events`** の 4 テーブル
- **1 Order : N Transaction**: 再決済で別カードを試す場合に同 Order に新規 Transaction を紐付ける
- **業務状態と決済状態の分離**:
  - `Order.status` = 業務状態（pending / paid / canceled / refunded）
  - `Transaction.status` = 決済試行状態（Stripe PaymentIntent と一致）
- **webhook = single source of truth**:
  - `payment_intent.succeeded` を受信した時に `WebhookController` が DB transaction 内で
    Transaction.status と Order.status を atomic に更新
  - frontend の confirm response や redirect 戻りは UX 用 hint であり業務確定の根拠ではない
- 詳細は [`../docs/design/error-handling.md`](../docs/design/error-handling.md) §8.4 と
  [`../docs/design/order-lifecycle.md`](../docs/design/order-lifecycle.md)

## テスト

```bash
# PHPUnit (RefreshDatabase + MySQL threeds2_demo_test、46 ケース)
docker compose exec backend-laravel php artisan test

# Pint: コードスタイル check (dry-run)
docker compose exec backend-laravel ./vendor/bin/pint --test

# PHPStan: 静的解析
docker compose exec backend-laravel ./vendor/bin/phpstan analyse
```

test DB (`threeds2_demo_test`) は MySQL 初回起動時に
[`../docker/mysql/init/01-create-test-db.sql`](../docker/mysql/init/01-create-test-db.sql)
で自動作成される。

## 関連 doc

- [root README](../README.md) — セットアップ全体
- [`../docs/architecture.md`](../docs/architecture.md) — 全体構造
- [`../docs/design/error-handling.md`](../docs/design/error-handling.md) — エラー方針
- [`../docs/design/order-lifecycle.md`](../docs/design/order-lifecycle.md) — pending Order の内訳
- [`../docs/design/confirmation-flow.md`](../docs/design/confirmation-flow.md) — 両 flow 設計
- [CLAUDE.md](../CLAUDE.md) — AI エージェント向け規約
