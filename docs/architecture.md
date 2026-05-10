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

### 4.1 frictionless（3DS2 challenge 不要）

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant V as Vue (PaymentForm)
    participant L as Laravel (PaymentController)
    participant S as Stripe API

    U->>V: カード情報入力
    V->>L: POST /api/payments
    L->>S: PaymentIntent 作成
    S-->>L: client_secret + status=requires_payment_method
    L-->>V: PaymentResponse (client_secret)
    V->>S: stripe.confirmCardPayment(client_secret, {card})<br/>※ handleActions: false
    S-->>V: paymentIntent.status=succeeded
    V-->>U: 成功画面

    Note over S,L: 並行して webhook 配送
    S-)L: POST /api/webhooks/stripe<br/>(payment_intent.succeeded)
    L->>L: 署名検証 + idempotency 検査<br/>+ Transaction.status 更新
```

### 4.2 challenge（3DS2 認証必要）

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant V as Vue (PaymentForm/ChallengeView)
    participant L as Laravel
    participant S as Stripe API
    participant ACS as Issuer ACS

    U->>V: カード情報入力
    V->>L: POST /api/payments
    L->>S: PaymentIntent 作成
    S-->>L: client_secret
    L-->>V: PaymentResponse
    V->>S: stripe.confirmCardPayment(client_secret, {card})
    S-->>V: status=requires_action<br/>next_action=use_stripe_sdk
    V->>U: ChallengeView 表示
    V->>S: stripe.handleNextAction({clientSecret})
    S->>ACS: 3DS2 CReq (Stripe.js が iframe で実施)
    ACS-->>U: 認証 UI
    U->>ACS: 認証情報入力
    ACS-->>S: 3DS2 CRes
    S-->>V: status=succeeded
    V-->>U: 成功画面
    S-)L: webhook payment_intent.succeeded
```

### 4.3 webhook idempotency

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
        W->>DB: INSERT webhook_events
        W->>DB: COMMIT
        W-->>S: 204
    end
```

`psp_event_id` をユニークキーに使うことで、Stripe からの retry が来ても重複適用を防ぐ。

---

## 5. データモデル

```mermaid
erDiagram
    transactions ||--o{ webhook_events : "1 : N"
    transactions {
        string id PK "txn_<ULID>"
        string psp_payment_intent_id "pi_..."
        string client_secret
        string status "PaymentStatus enum"
        bigint amount
        string currency
        json next_action
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

- `transactions.id` / `webhook_events.id` は接頭辞付き ULID（[`Support\IdGenerator`](../backend-laravel/app/Support/IdGenerator.php)）
- `webhook_events.psp_event_id` でユニーク制約（idempotency 担保）

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
- [docs/codegen-guide.md](codegen-guide.md) — contract から TS / PHP の型を生成する手順
- [backend-laravel/app/Enums/PaymentStatus.php](../backend-laravel/app/Enums/PaymentStatus.php) — State enum 実装
- [backend-laravel/app/Adapters/PaymentAdapterInterface.php](../backend-laravel/app/Adapters/PaymentAdapterInterface.php) — backend Adapter

### 外部
- EMV 3-D Secure Protocol and Core Functions Specification — https://www.emvco.com/specifications/
- Stripe Payment Intents API — https://docs.stripe.com/api/payment_intents
- Stripe 3D Secure 2 — https://docs.stripe.com/payments/3d-secure
- Stripe Webhooks signing — https://docs.stripe.com/webhooks#verify-events
