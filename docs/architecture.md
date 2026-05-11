# Architecture

3ds2-demo のシステム構成と設計思想を記述する。実装の細部はソースコードを参照すること。本ドキュメントは「**なぜ**この構造か」と「**何を**抽象化したか」を残すことを目的とする。

---

## 1. レイヤー構造

```mermaid
flowchart LR
    subgraph Browser["Browser (Vue 3 + TS)"]
        UI[PaymentForm.vue<br/>ChallengeView / ResultView]
        Store[Pinia store<br/>payment.ts]
        FE[PspClient interface]
        StripeFE[StripePspClient ✓]
        StripeJS[Stripe.js]
    end

    subgraph Backend["Backend (Laravel 12 / PHP 8.3)"]
        Ctrl[PaymentController<br/>WebhookController]
        BE[PaymentAdapterInterface]
        Stripe[StripeAdapter ✓]
        Adyen[AdyenAdapter<br/>スタブのみ]
    end

    subgraph PSP["PSP (Stripe TEST)"]
        StripeAPI[Payment Intents API]
    end

    UI --> Store
    Store --> FE
    FE --> StripeFE
    StripeFE --> StripeJS
    StripeJS -.HTTPS.-> StripeAPI

    Store -->|REST /api/payments| Ctrl
    Ctrl --> BE
    BE --> Stripe
    BE -.-> Adyen
    Stripe -->|Stripe PHP SDK| StripeAPI

    StripeAPI -.webhook.-> Ctrl
```

### キー設計判断

| 判断 | 理由 |
|---|---|
| **frontend / backend を別プロセス** (monorepo) | 学習デモとして「実 SaaS 構成」に近づけ、Adyen 等別 SDK 構成へ差し替えるイメージを持たせる |
| **API contract 駆動** ([docs/api-contract.yaml](api-contract.yaml)) | frontend ↔ backend の境界を OpenAPI で固定化し、backend 実装が言語別実装に差し替わっても frontend 不変 |
| **両層 Adapter** (backend は実装済、frontend は未) | PSP 統合形態（Direct API / Hosted / iframe / JS Module）をいずれも吸収できる対称構造 |
| **Stripe Advanced flow** （Sessions ではなく Payment Intents 直接制御） | 3DS2 challenge 経路 (`use_stripe_sdk` / `redirect_to_url`) を明示的にハンドリングし、仕様理解を可視化する |

---

## 2. Adapter パターン

### 2.1 backend Adapter（実装済）

`PaymentAdapterInterface` が backend ↔ PSP API の境界を抽象化する。

```
app/Adapters/
├── PaymentAdapterInterface.php   # 共通 interface
├── StripeAdapter.php             # 実装（createPayment / confirmPayment / getPayment / verifyWebhookSignature）
└── AdyenAdapter.php              # スタブ（throw NotImplementedException）
```

`AdyenAdapter` をスタブだけにしているのは「**設計拡張可能性**を示すための明示的なドキュメンテーション」であり、Adyen API の仕様には踏み込まない（NDA・YAGNI 双方の観点）。

### 2.2 frontend Adapter

backend と対称な抽象化を `PspClient` interface として frontend にも導入し、Vue 層から PSP SDK 固有性を遮断する。`PaymentForm.vue` / payment store は `PspClient` のみに依存し、`@stripe/stripe-js` を直接 import しない。

```
frontend/src/services/
├── PspClient.ts        # interface (init / mountCardForm / confirmAndChallenge)
├── StripePspClient.ts  # 実装（Stripe.js を集約）
└── (Adyen / 他 PSP は未実装)
```

### 2.3 統合形態の吸収

PSP の統合パターンは大別して 4 種類あり、両層 Adapter で以下のように吸収する:

| 統合タイプ | 例 | backend Adapter | frontend Adapter |
|---|---|---|---|
| Direct API 型 | Stripe Payment Intents / Adyen Advanced | `createPayment` / `confirmPayment` | `mountCardForm` + `confirmAndChallenge` |
| Hosted Payment Page 型 | Stripe Checkout 等 | `createCheckoutSession`（拡張要） | redirect 表示のみ |
| JS Module 型 | Adyen Drop-in 等 | Direct API 型と同じ | `mountCardForm` 内部で SDK 流儀に従う |
| iframe 完結型 | 一般的な日本 PSP（公開 API ベースのもの） | `createPayment` のみ | `mountCardForm` が iframe を生成、postMessage 受信 |

**現状 Stripe（Direct API 型）のみ実装。他の統合タイプは interface の前提を確認してから拡張する。**

---

## 3. State Machine

### 3.1 Stripe Payment Intent ↔ EMVCo 3DS2 マッピング

Stripe Payment Intent の `status` を内部状態とし、EMVCo 3DS2 メッセージフロー (AReq → ARes → CReq → CRes) と対応付ける。

| Stripe status | EMVCo フェーズ | 説明 |
| --- | --- | --- |
| `requires_payment_method` | 未送信 | PaymentIntent 作成直後、payment method 未確定 |
| `requires_confirmation` | AReq 送信直前 | payment method 確定、confirm 待ち |
| `requires_action` | ARes / CReq | 3DS2 challenge が必要な状態 (`next_action` あり) |
| `processing` | CRes 後の processing | 認証は通ったが capture 等で非同期処理中 |
| `requires_capture` | 認証成功 (manual capture) | authorize 完了、capture 未実行 |
| `succeeded` | 認証成功 + 売上確定 | 終端状態 |
| `canceled` | キャンセル | 終端状態 |

実装: [`App\Enums\PaymentStatus`](../backend-laravel/app/Enums/PaymentStatus.php) (`isTerminal()` / `requiresClientAction()` ヘルパー付き)

### 3.2 状態遷移図

```mermaid
stateDiagram-v2
    [*] --> requires_payment_method : POST /api/payments
    requires_payment_method --> requires_confirmation : payment method 紐付け
    requires_confirmation --> requires_action : 3DS2 challenge 必要
    requires_confirmation --> processing : frictionless 通過
    requires_action --> processing : challenge 成功
    requires_action --> requires_payment_method : challenge 失敗 (retry 可)
    processing --> succeeded : capture 完了
    processing --> requires_capture : manual capture 設定時
    requires_capture --> succeeded : capture 実行
    requires_payment_method --> canceled : cancel
    requires_confirmation --> canceled : cancel
    requires_action --> canceled : cancel
    succeeded --> [*]
    canceled --> [*]
```

`succeeded` / `canceled` のみ終端。それ以外は webhook で次フェーズに遷移しうる。

---

## 4. 主要シーケンス

3DS2 決済フローを 2 系統 (Client SDK / Server Redirect) と webhook 受信
経路に分けて図示する。

### 4.0 全体構成図

```mermaid
flowchart LR
    User([User])
    subgraph Frontend["Frontend - Vue 3"]
        OrderUI["OrderForm.vue (① カート)"]
        CardUI["PaymentCardSection.vue (② 決済)"]
        Store["stores/payment.ts"]
        StripeJS["StripePspClient.ts (via psp.ts)"]
        Return["PaymentReturn.vue"]
    end
    subgraph Backend["Backend - Laravel 12"]
        OrderCtrl["OrderController"]
        PayCtrl["PaymentController"]
        Adapter["StripeAdapter"]
        Webhook["WebhookController"]
        Handler["StripeEventHandler"]
        DB[("orders / order_items /<br/>transactions / webhook_events")]
    end
    Stripe["Stripe API"]
    Issuer["Issuer 3DS2"]

    User --> OrderUI --> Store
    User --> CardUI --> Store
    Store -->|"POST /api/orders"| OrderCtrl
    Store -->|"POST /api/payments {order_id}"| PayCtrl
    Store -->|"POST /confirm"| PayCtrl
    Store --> StripeJS
    StripeJS -.->|"confirmCardPayment / handleNextAction"| Stripe
    OrderCtrl --> DB
    PayCtrl --> Adapter
    Adapter -.->|"paymentIntents.create / confirm"| Stripe
    Stripe -.->|"3DS2 challenge"| Issuer
    Stripe -->|"webhook"| Webhook --> Handler --> DB
    Adapter --> DB
    Issuer -.->|"redirect return_url"| Return
    Return -->|"GET /api/payments/{id} + /api/orders/{id}"| PayCtrl
```

### 4.1 frictionless（3DS2 challenge 不要）

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant V as Vue (OrderForm + PaymentCardSection)
    participant L as Laravel (Order/PaymentController)
    participant S as Stripe API

    U->>V: ① カート入力 → カートイン
    V->>L: POST /api/orders { items, currency }
    L->>L: INSERT orders(pending) + order_items
    L-->>V: OrderResponse { id, amount, ... }

    U->>V: ② カード情報入力 → 支払う
    V->>L: POST /api/payments { order_id }
    L->>S: PaymentIntent 作成 (amount は Order から導出)
    S-->>L: client_secret + status=requires_payment_method
    L->>L: INSERT transactions(order_id, ...)
    L-->>V: PaymentResponse (client_secret)
    V->>S: stripe.confirmCardPayment(client_secret, {card})<br/>※ handleActions: false
    S-->>V: paymentIntent.status=succeeded
    V-->>U: 成功画面 (Stripe 側の結果は hint)

    Note over S,L: 業務確定は webhook が真値 (error-handling.md §8.4)
    S-)L: POST /api/webhooks/stripe<br/>(payment_intent.succeeded)
    L->>L: 署名検証 + idempotency 検査<br/>+ Transaction.status / Order.status を atomic 更新
```

### 4.2 challenge（3DS2 認証必要）

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant V as Vue (OrderForm + PaymentCardSection + ChallengeView)
    participant L as Laravel
    participant S as Stripe API
    participant ACS as Issuer ACS

    U->>V: ① カートイン
    V->>L: POST /api/orders { items, currency }
    L-->>V: OrderResponse { id, ... }

    U->>V: ② カード情報入力 → 支払う
    V->>L: POST /api/payments { order_id }
    L->>S: PaymentIntent 作成
    S-->>L: client_secret
    L-->>V: PaymentResponse
    V->>S: stripe.confirmCardPayment(client_secret, {card})
    S-->>V: status=requires_action<br/>next_action=use_stripe_sdk
    V->>U: ChallengeView 表示
    V->>S: stripe.handleNextAction({clientSecret})
    S->>ACS: 3DS2 CReq (PSP SDK が iframe で実施)
    ACS-->>U: 認証 UI
    U->>ACS: 認証情報入力
    ACS-->>S: 3DS2 CRes
    S-->>V: status=succeeded
    V-->>U: 成功画面
    S-)L: webhook payment_intent.succeeded<br/>(Transaction + Order を同期)
```

### 4.3 server_redirect flow（full-page 3DS2、日本 PSP 風）

国内 PSP に多い、issuer ページに画面遷移して認証を完結させる経路。

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend
    participant SJS as Stripe.js
    participant BE as Laravel API
    participant SA as Stripe API
    participant Iss as Issuer

    User->>FE: ① カートイン → ② submit (server_redirect)
    Note over FE,BE: 事前に POST /api/orders 済
    FE->>BE: POST /api/payments {order_id}
    BE->>SA: paymentIntents.create
    SA-->>BE: {id, client_secret}
    BE-->>FE: {id, order_id, client_secret}

    FE->>SJS: createPaymentMethod(card)
    SJS->>SA: tokenize card
    SA-->>SJS: payment_method_id
    SJS-->>FE: payment_method_id

    FE->>FE: build return_url<br/>?txn={intentId} + sessionStorage
    FE->>BE: POST /api/payments/{id}/confirm<br/>{payment_method_id, flow, return_url}
    BE->>SA: paymentIntents.confirm<br/>(payment_method, return_url)
    SA-->>BE: PI (next_action: redirect_to_url)
    BE-->>FE: {status, next_action}

    FE->>FE: phase = redirecting
    FE->>User: navigate(next_action.redirect_to_url.url)
    User->>Iss: 3DS2 challenge (full page)
    Iss->>User: redirect → /payments/return?txn={id}

    par 並行 (順序保証なし)
        SA-->>BE: webhook payment_intent.succeeded
        BE->>BE: update Transaction / Order
    and
        User->>FE: PaymentReturn.vue mount
        FE->>FE: txn = query.txn ?? sessionStorage
        FE->>BE: GET /api/payments/{txn}
        BE-->>FE: {status, ...}
    end

    FE->>FE: ResultView
```

`?txn={id}` (Strategy C) + `sessionStorage` (Strategy B) を二重化することで、
issuer が query を落とすケースに備える ([design/confirmation-flow.md §8.1](./design/confirmation-flow.md#81-paymentreturnvue-での内部-id-逆引き--実装済))。

### 4.4 webhook idempotency

```mermaid
sequenceDiagram
    autonumber
    participant S as Stripe
    participant W as WebhookController
    participant DB as MySQL

    S->>W: POST /api/webhooks/stripe<br/>(Stripe-Signature)
    W->>W: HMAC-SHA256 検証<br/>(StripeAdapter::verifyWebhookSignature)
    alt 署名検証失敗
        W-->>S: 400 signature_verification_failed
    end
    W->>DB: SELECT FROM webhook_events<br/>WHERE psp_event_id=?
    alt 既処理
        W-->>S: 204 (no-op)
    else 未処理
        W->>DB: BEGIN
        W->>DB: UPDATE transactions SET status,...<br/>(StripeEventHandler)
        W->>DB: UPDATE orders SET status='paid'<br/>(succeeded の場合のみ、syncOrderStatus)
        W->>DB: INSERT webhook_events
        W->>DB: COMMIT
        W-->>S: 204
    end
```

`psp_event_id` をユニークキーに使うことで、Stripe からの retry が来ても重複適用を防ぐ。

### 4.5 frontend phase state machine

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> preparing: submit()
    preparing --> challenging: next_action (iframe)
    preparing --> redirecting: next_action (redirect_to_url)
    preparing --> succeeded: status=succeeded
    preparing --> failed: error
    challenging --> succeeded
    challenging --> failed
    redirecting --> [*]: browser leaves
    [*] --> succeeded: PaymentReturn (GET /payments/{id})
    [*] --> failed: PaymentReturn
    succeeded --> idle: reset()
    failed --> idle: reset()
```

### 4.6 設計ポイントと主要 file:line

- **Client SDK flow**: Stripe.js が status を直接返すため、webhook と UI 確定が独立しても race にならない
- **Server Redirect flow**: return から戻った時点で webhook が先着している保証がないため、`GET /api/payments/{id}` でサーバ側の最新状態を取りに行く
- **業務確定 = Order.paid** は webhook のみで遷移する真値 (詳細は [design/error-handling.md §8.4](./design/error-handling.md#84-業務進行のトリガー) / [design/order-lifecycle.md](./design/order-lifecycle.md))

主要実装ファイル:

- [frontend/src/stores/payment.ts](../frontend/src/stores/payment.ts) — `start()`, `runClientSdkFlow()`, `runServerRedirectFlow()`
- [frontend/src/services/StripePspClient.ts](../frontend/src/services/StripePspClient.ts) — `confirmCardPayment` + `handleNextAction`
- [frontend/src/views/PaymentReturn.vue](../frontend/src/views/PaymentReturn.vue) — return URL ハンドラ
- [backend-laravel/app/Http/Controllers/Api/PaymentController.php](../backend-laravel/app/Http/Controllers/Api/PaymentController.php) — create / confirm / show
- [backend-laravel/app/Adapters/StripeAdapter.php](../backend-laravel/app/Adapters/StripeAdapter.php) — `paymentIntents.create` (`request_three_d_secure: 'any'`) / `paymentIntents.confirm`
- [backend-laravel/app/Http/Controllers/Api/WebhookController.php](../backend-laravel/app/Http/Controllers/Api/WebhookController.php) — 署名検証 + idempotency
- [backend-laravel/app/Services/StripeEventHandler.php](../backend-laravel/app/Services/StripeEventHandler.php) — Transaction + Order 状態同期

---

## 5. データモデル

```mermaid
erDiagram
    orders ||--o{ order_items : "1 : N"
    orders ||--o{ transactions : "1 : N (再決済対応)"
    transactions ||--o{ webhook_events : "1 : N"
    orders {
        string id PK "ord_<ULID>"
        string status "OrderStatus enum<br/>pending|paid|canceled|refunded"
        bigint amount "items 合計の真値"
        string currency
        json metadata
        timestamp created_at
        timestamp updated_at
    }
    order_items {
        string id PK "oit_<ULID>"
        string order_id FK
        string name
        int quantity
        bigint unit_price
        timestamp created_at
        timestamp updated_at
    }
    transactions {
        string id PK "txn_<ULID>"
        string order_id FK "紐づく Order"
        string psp "stripe / adyen ..."
        string psp_payment_intent_id "pi_..."
        string client_secret
        string status "PaymentStatus enum"
        bigint amount "Order.amount のスナップショット"
        string currency
        json next_action
        json metadata
        timestamp created_at
        timestamp updated_at
    }
    webhook_events {
        string id PK "evt_<ULID>"
        string psp "stripe / adyen ..."
        string psp_event_id UK "Stripe evt_..."
        string event_type "payment_intent.succeeded ..."
        string transaction_id FK
        json payload
        timestamp received_at
        timestamp processed_at
    }
```

- 主キーは全て接頭辞付き ULID（[`Support\IdGenerator`](../backend-laravel/app/Support/IdGenerator.php)）
- `orders.status` は業務状態、`transactions.status` は決済試行の状態。**両軸を分離**するのが本設計の核 (1 Order : N Transaction で同 Order 再決済が可能)
- `webhook_events.psp_event_id` でユニーク制約（idempotency 担保）
- `pending` の細分（離脱 / 失敗 / 処理中 / webhook 遅延）は [`design/order-lifecycle.md`](./design/order-lifecycle.md) §2 参照

---

## 6. 設計判断の補足

### Stripe Sessions ではなく Payment Intents を直接制御する理由
Sessions（Checkout）は 3DS2 challenge を含む決済フロー全体を Stripe ホスト画面に委譲するため、`next_action` 等の中間状態が利用側コードに見えない。Payment Intents を直接扱うことで `next_action.type` を `use_stripe_sdk` / `redirect_to_url` で分岐させ、3DS2 仕様上の AReq / ARes / CReq / CRes の各フェーズを明示的にハンドリングできる。

### Adapter パターンを採る理由
PSP 切替の影響を Adapter 内に局所化するため。同一 interface であれば backend 言語（PHP / Java / Go / Node 等）が切り替わっても置換可能で、API contract も不変に保てる。

### frontend にも Adapter を置く理由
iframe 完結型・JS Module 型の PSP は SDK 固有 API が DOM 操作層に漏れる。backend だけ抽象化しても、frontend が Stripe.js を直接呼んでいる限り PSP 切替時に Vue コンポーネントを書き直すことになる。両層で抽象化して初めて切替コストが線形に縮む。

### State Machine を明示する理由
Stripe API の `status` 名は PSP 固有の語彙であり、EMVCo 3DS2 仕様用語とは別ドメインに属する。実装内で両者の対応をテーブルとして持つことで「PSP API のドメイン」と「標準仕様のドメイン」を分離して扱える。

### webhook を idempotent にする理由
Stripe は webhook 配送失敗時に指数バックオフで retry し、同一イベントを複数回送る可能性がある。`psp_event_id` をユニーク制約にすることで二重適用を防ぐ。

---

## 7. 制約・非対応

- 本リポジトリは **Stripe TEST 環境前提**。本番運用は対象外
- 日本 PSP（GMO-PG / SBPS / DGFT 等）の Adapter は実装しない（NDA 制約、[CLAUDE.md](../CLAUDE.md) §40-46）
- 3DS2 のうち Stripe TEST 環境で再現可能なシナリオに限定（frictionless / challenge / decline）
- Capture / Refund / Dispute は scope 外（コア課題は 3DS2 認証フローの可視化）

---

## 8. 参照

### 内部
- [docs/api-contract.yaml](api-contract.yaml) — REST API 仕様（OpenAPI 3.x）
- [docs/design/error-handling.md](design/error-handling.md) — エラー方針 / webhook 真値遷移
- [docs/design/order-lifecycle.md](design/order-lifecycle.md) — pending Order の内訳
- [docs/design/confirmation-flow.md](design/confirmation-flow.md) — client_sdk / server_redirect の責務分担
- [backend-laravel/app/Enums/PaymentStatus.php](../backend-laravel/app/Enums/PaymentStatus.php) — State enum 実装
- [backend-laravel/app/Adapters/PaymentAdapterInterface.php](../backend-laravel/app/Adapters/PaymentAdapterInterface.php) — backend Adapter

### 外部
- EMV 3-D Secure Protocol and Core Functions Specification — https://www.emvco.com/specifications/
- Stripe Payment Intents API — https://docs.stripe.com/api/payment_intents
- Stripe 3D Secure 2 — https://docs.stripe.com/payments/3d-secure
- Stripe Webhooks signing — https://docs.stripe.com/webhooks#verify-events
