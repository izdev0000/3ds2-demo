# 決済フロー データフロー

3DS2 決済フローを Mermaid 図で示す。Client SDK flow（iframe challenge）と Server Redirect flow（full-page redirect）の 2 系統。

## 全体構成図

```mermaid
flowchart LR
    User([User])
    subgraph Frontend["Frontend - Vue 3"]
        Form["PaymentForm.vue"]
        Store["stores/payment.ts"]
        StripeJS["StripePspClient.ts"]
        Return["PaymentReturn.vue"]
    end
    subgraph Backend["Backend - Laravel 12"]
        Ctrl["PaymentController"]
        Adapter["StripeAdapter"]
        Webhook["WebhookController"]
        Handler["StripeEventHandler"]
        DB[("Transaction / WebhookEvent")]
    end
    Stripe["Stripe API"]
    Issuer["Issuer 3DS2"]

    User --> Form --> Store
    Store -->|"POST /api/payments"| Ctrl
    Store -->|"POST /confirm"| Ctrl
    Store --> StripeJS
    StripeJS -.->|"confirmCardPayment / handleNextAction"| Stripe
    Ctrl --> Adapter
    Adapter -.->|"paymentIntents.create / confirm"| Stripe
    Stripe -.->|"3DS2 challenge"| Issuer
    Stripe -->|"webhook"| Webhook --> Handler --> DB
    Adapter --> DB
    Issuer -.->|"redirect return_url"| Return
    Return -->|"GET /api/payments/{id}"| Ctrl
```

## Flow A: Client SDK Flow (frictionless / iframe challenge)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend<br/>(payment.ts)
    participant Stripe as Stripe.js
    participant BE as Laravel API
    participant SA as Stripe API
    participant Iss as Issuer

    User->>FE: submit (amount, card)
    FE->>BE: POST /api/payments {amount, currency}
    BE->>SA: paymentIntents.create<br/>(request_three_d_secure: any)
    SA-->>BE: {id, client_secret, status}
    BE-->>FE: {id, client_secret}

    FE->>Stripe: confirmCardPayment<br/>(clientSecret, card, handleActions:false)
    Stripe->>SA: confirm PI
    SA-->>Stripe: PI (requires_action | succeeded)
    Stripe-->>FE: PI

    alt requires_action (3DS2)
        FE->>FE: phase = challenging
        FE->>Stripe: handleNextAction(clientSecret)
        Stripe->>Iss: 3DS2 iframe (CReq)
        User->>Iss: complete challenge
        Iss-->>Stripe: CRes
        Stripe-->>FE: PI (succeeded)
    end

    SA-->>BE: webhook payment_intent.succeeded
    BE->>BE: verify signature → idempotency<br/>→ update Transaction
    FE->>FE: phase = succeeded → ResultView
```

## Flow B: Server Redirect Flow (full-page 3DS2)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend
    participant SJS as Stripe.js
    participant BE as Laravel API
    participant SA as Stripe API
    participant Iss as Issuer

    User->>FE: submit (server_redirect)
    FE->>BE: POST /api/payments
    BE->>SA: paymentIntents.create
    SA-->>BE: {id, client_secret}
    BE-->>FE: {id, client_secret}

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
        BE->>BE: update Transaction
    and
        User->>FE: PaymentReturn.vue mount
        FE->>FE: txn = query.txn ?? sessionStorage
        FE->>BE: GET /api/payments/{txn}
        BE-->>FE: {status, ...}
    end

    FE->>FE: ResultView
```

## State Machine (frontend `phase`)

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

## 主要 file:line リファレンス

- [frontend/src/stores/payment.ts](../frontend/src/stores/payment.ts) — `start()`:63, `runClientSdkFlow()`:95, `runServerRedirectFlow()`:122
- [frontend/src/services/StripePspClient.ts:96](../frontend/src/services/StripePspClient.ts#L96) — `confirmCardPayment` + `handleNextAction`
- [frontend/src/views/PaymentReturn.vue:17](../frontend/src/views/PaymentReturn.vue#L17) — return URL ハンドラ
- [backend-laravel/app/Http/Controllers/Api/PaymentController.php:35](../backend-laravel/app/Http/Controllers/Api/PaymentController.php#L35) — create / confirm / show
- [backend-laravel/app/Adapters/StripeAdapter.php:49](../backend-laravel/app/Adapters/StripeAdapter.php#L49) — `paymentIntents.create`（`request_three_d_secure: 'any'`）
- [backend-laravel/app/Adapters/StripeAdapter.php:107](../backend-laravel/app/Adapters/StripeAdapter.php#L107) — `paymentIntents.confirm`
- [backend-laravel/app/Http/Controllers/Api/WebhookController.php:45](../backend-laravel/app/Http/Controllers/Api/WebhookController.php#L45) — 署名検証 + idempotency
- [backend-laravel/app/Services/StripeEventHandler.php:47](../backend-laravel/app/Services/StripeEventHandler.php#L47) — Transaction 状態同期

## 設計ポイント

- **Client SDK flow**: Stripe.js が status を直接返すため、webhook と UI 確定が独立しても race にならない。
- **Server Redirect flow**: return から戻った時点で webhook が先着している保証がないため、`GET /api/payments/{id}` でサーバ側の最新状態を取りに行く。
- **txn 受け渡し戦略**: `?txn={id}` (Strategy C) + sessionStorage (Strategy B) の二重化で、issuer が query を落とすケースに備える。
