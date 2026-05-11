# 3ds2-demo / frontend

EMV 3-D Secure 2.x 統合学習デモの **frontend**。Vue 3 + TypeScript + Vite +
Stripe.js / Stripe Elements。Order 駆動の 2 ステップ UX を実装する。

セットアップ・docker 起動・Stripe key の取り回しなど **環境構築は
[root README](../README.md) を参照**。本 README は frontend 内部の
構造のみ扱う。

## 2 ステップ UX

```
① カート: OrderForm  →  POST /api/orders で pending Order 作成
                          ↓
② 決済:   PaymentCardSection  →  POST /api/payments {order_id}
                                   ↓
                                   3DS2 challenge (必要なら)
                                   ↓
                                   Stripe succeeded (frontend hint)
                                   ↓
                                   webhook で Order.paid 確定 (真値)
```

`OrderForm` で「カートイン」を押すまでは `PaymentCardSection` が disabled、
カートイン後に決済が有効化される。失敗時は同じ Order に対して別カードで
再試行できる（1 Order : N Transaction）。

教育目的の解説は [`../docs/design/error-handling.md`](../docs/design/error-handling.md) §8.4 と
[`../docs/design/order-lifecycle.md`](../docs/design/order-lifecycle.md) 参照。

## ディレクトリ

```
src/
├── components/
│   ├── OrderForm.vue              # ① カート (items 入力 + カートイン)
│   ├── PaymentCardSection.vue     # ② 決済 (カード + 支払う)
│   ├── PaymentFlowTabs.vue        # client_sdk / server_redirect 切替
│   ├── ChallengeView.vue          # 3DS2 challenge 進行表示
│   ├── ResultView.vue             # 成功画面 + Order.status fetch
│   ├── TestCardsPanel.vue         # Stripe テストカード 1-click 実行
│   └── RecentRowsViewer.vue       # DB 4 テーブル直近 5 行 (3 秒 polling)
├── services/
│   ├── PspClient.ts               # PSP 抽象 interface
│   ├── StripePspClient.ts         # Stripe 具体実装
│   ├── psp.ts                     # DI ポイント (export pspClient: PspClient)
│   ├── order.ts                   # POST /api/orders, GET /api/orders/{id}
│   ├── payment.ts                 # POST /api/payments, /confirm, GET
│   ├── debug.ts                   # GET /api/_debug/recent-rows
│   ├── navigation.ts              # window.location.assign のラッパ (テスト用)
│   └── paymentLock.ts             # 多 tab 排他 (localStorage ベース)
├── stores/
│   └── payment.ts                 # phase / order / start / createOrder / reset
├── views/
│   ├── PaymentPage.vue            # main page (OrderForm + Card + Result + Viewer)
│   └── PaymentReturn.vue          # redirect flow の戻り先
└── router/
    └── index.ts
```

## PSP 抽象化

各 component は **`pspClient` を `@/services/psp` から import** し、
具体実装（`StripePspClient`）を直接知らない構成:

```ts
// 各 component / store でこう書く
import { pspClient } from '@/services/psp'

await pspClient.confirmAndChallenge({...})
```

Stripe 以外を試したい場合は `services/psp.ts` の binding を差し替えれば、
component に変更は不要（backend の `PaymentAdapterInterface` と同じ方針）。

## 開発コマンド

```bash
# dev サーバ起動 (Vite, http://localhost:5173)
docker compose exec frontend npm run dev

# 型検査 (vue-tsc)
docker compose exec frontend npm run type-check

# unit test (vitest, 45 ケース)
docker compose exec frontend npm run test:unit -- --run

# Lint
docker compose exec frontend npm run lint

# production build
docker compose exec frontend npm run build
```

## 関連 doc

- [root README](../README.md) — セットアップ全体
- [`../docs/architecture.md`](../docs/architecture.md) — 全体構造
- [`../docs/payment-flow.md`](../docs/payment-flow.md) — frontend ↔ backend ↔ Stripe のフロー図
- [`../docs/design/confirmation-flow.md`](../docs/design/confirmation-flow.md) — client_sdk / server_redirect 設計
- [`../docs/design/order-lifecycle.md`](../docs/design/order-lifecycle.md) — pending Order の内訳
- [CLAUDE.md](../CLAUDE.md) — AI エージェント向け規約
