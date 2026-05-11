# 3ds2-demo

EMV 3-D Secure 2.x の統合学習デモ。**Vue 3 frontend × Laravel 12 backend** による Stripe API 連携の実動作版です。

> ⚠️ **Disclaimer**
> 本リポジトリは Stripe 公式の資産ではありません。学習目的の個人プロジェクトであり、Stripe, Inc. および関連企業との提携・スポンサー関係はいっさいありません。本番環境での利用は想定しておらず、実際の決済導入には Stripe 公式ドキュメントおよび公式 SDK を直接参照してください。

> 🚧 **WIP**: 現在開発中。

> 🤖 本リポジトリは [Claude Code]を活用して開発しています。設計・仕様判断は人間、ボイラープレート / 型定義 / テストケース生成は AI に委譲。エージェント向けの規約は [CLAUDE.md](./CLAUDE.md) を参照。

---

## 本リポジトリの位置づけ

- 決済ドメイン実務者の視点から、**EMVCo 標準仕様** と **Stripe API による 3DS2 統合** を整理した学習用実装
- 日本語による vendor-neutral な 3DS2 学習資料の不足を埋めることを目的とする
- 本番運用ライブラリではありません（実装時は Stripe 公式 SDK を直接利用してください）
- 日本 PSP（GMO-PG, SBPS 等）の統合ガイドではありません（非公開 API のため作成不可）
- EMVCo 仕様書の代替ではありません（仕様本体は EMVCo 公式文書を参照）

## ディレクトリ構造

```
3ds2-demo/
├── frontend/             # Vue 3 + TS + Vite + Stripe.js / Stripe Elements
├── backend-laravel/      # PHP 8.3 + Laravel 12 + Stripe PHP SDK
├── docker-compose.yml    # profile 切替で backend を選択
└── docs/                 # 3DS2 仕様解説（言語非依存）
```

frontend と backend は API contract（OpenAPI）で結合されており、backend 実装は差し替え可能な構成。

## 技術スタック

| レイヤ | 技術 |
| --- | --- |
| Frontend | **Vue 3** / TypeScript / Vite / Stripe.js + Stripe Elements |
| Backend | PHP 8.3 / **Laravel 12** / Stripe PHP SDK (`stripe/stripe-php`) |
| DB | MySQL 8 |
| Infra | Docker Compose（profile 切替対応） |

## 設計の要点

- **Vue frontend × Laravel backend** を分離、`docker-compose` profile で backend を選択して起動
- **API contract 駆動**: OpenAPI で frontend ↔ backend の境界を明示
- **Adapter パターン**で PSP を抽象化（`StripeAdapter` 実動作 + `AdyenAdapter` はスタブのみ）
- **Payment Intents API + `next_action` の明示的ハンドリング** を採用（Stripe.js の自動 iframe 任せにせず、3DS2 challenge 経路を制御）
- `request_three_d_secure: 'any'` で frictionless / challenge 両経路を検証
- **Webhook + HMAC 署名検証**（`Stripe-Signature`）を実装、実務感を反映
- トランザクション状態は明示的な **State Machine** で管理（Stripe Payment Intent state ↔ EMVCo 3DS2 メッセージフロー AReq → ARes → CReq → CRes をマッピング）

## 環境構築

### 前提

- Docker + Docker Compose
- Stripe TEST アカウント（下記手順で gmail のみで即時発行可能、business website / 法人情報は不要）

### Stripe アカウントと API key の準備

1. [Stripe Dashboard 登録ページ](https://dashboard.stripe.com/register) で gmail だけでアカウントを発行
2. 登録直後は **TEST mode** で開く（ダッシュボード右上のトグルが「テストモード」になっていることを確認）。本番化（Activate）は不要、TEST mode のままで全機能を試せる
3. 左サイドバー **Developers → API keys** を開く
   - **Publishable key**: `pk_test_...` が表示されている。クリックでコピー
   - **Secret key**: 「**Reveal test key**」ボタンを押すと `sk_test_...` が表示される。クリックでコピー
4. 取得した 2 つの key を `.env` に転記
   - `.env` (root) の `STRIPE_API_KEY=sk_test_...` と `STRIPE_PUBLISHABLE_KEY=pk_test_...`
   - `backend-laravel/.env` の `STRIPE_SECRET_KEY=sk_test_...`（root の `STRIPE_API_KEY` と同じ値）

> 💡 **なぜ secret key を 2 箇所に書くか**: compose の root `.env` は `stripe-cli` コンテナと frontend コンテナにのみ渡され、backend-laravel コンテナへは渡らない設計です。backend は `backend-laravel/.env` を直接読むため、同じ secret key を 2 箇所に書く運用になっています。
>
> 詳細は後述の「**Stripe key の整理**」テーブル参照。

> 🔐 取得した key は誰にも見せないこと（漏洩した場合は Dashboard で即 roll する）。`.env` は `.gitignore` 済なのでコミットされません。

### 手順

```bash
# 1. clone
git clone https://github.com/izdev0000/3ds2-demo.git
cd 3ds2-demo

# 2. .env を準備 (compose 用 / Laravel 用)
cp .env.example .env
cp backend-laravel/.env.example backend-laravel/.env
```

3. Stripe TEST の API key 系を 2 つの `.env` に転記する（下記「Stripe key の整理」参照）
   - `.env` (root, compose 用) に `STRIPE_API_KEY` (`sk_test_...`) / `STRIPE_PUBLISHABLE_KEY` (`pk_test_...`)
   - `backend-laravel/.env` に `STRIPE_SECRET_KEY` (`sk_test_...`、上記 `STRIPE_API_KEY` と**同じ値**)

```bash
# 4. Docker Compose 起動 (backend profile で全サービスを立ち上げ)
docker compose --profile laravel up -d
```

起動するサービス:

| サービス | 役割 |
| --- | --- |
| `mysql` | MySQL 8.4 |
| `backend-laravel` + `nginx` | PHP 8.3 + Laravel 12 |
| `frontend` | Vite dev server |
| `stripe-cli` | webhook を `/api/webhooks/stripe` へ forward |

**5. webhook signing secret (`whsec_...`) を `stripe-cli` ログから取得**

`stripe-cli` コンテナは起動時に Stripe にログインし、その session 専用の webhook signing secret を発行してログ出力します（CLI 経由の listen は Dashboard と別系統の whsec を使う）。

```bash
docker compose logs stripe-cli | grep -i "webhook signing secret"
```

出力例:
```
Ready! You are using Stripe API Version [...]. Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx (^C to quit)
```

`whsec_...` 部分をコピーして `backend-laravel/.env` に貼り付け、backend を再起動:

```bash
# backend-laravel/.env を編集:
#   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
# その後:
docker compose restart backend-laravel
```

**6. APP_KEY 生成 + DB マイグレーション**

```bash
docker compose exec backend-laravel php artisan key:generate
docker compose exec backend-laravel php artisan migrate
```

**7. ブラウザで動作確認**

- frontend: http://localhost:5173
- backend health: http://localhost:8000/up

決済を試行すると `docker compose logs stripe-cli` に webhook 配送ログが流れる:

```
--> payment_intent.succeeded [evt_xxx]
<-- [204] POST http://nginx:80/api/webhooks/stripe [evt_xxx]   ← 成功
<-- [400] POST http://nginx:80/api/webhooks/stripe [evt_xxx]   ← 署名失敗
```

> ⚠️ **`stripe-cli` を再起動すると `whsec_...` が再発行される** ため、コンテナを起動し直したら毎回 step 5 をやり直してください（学習デモのため自動化していません）。webhook が `400` を返す場合の典型原因はこの不一致です。

### stripe-cli の便利コマンド（任意）

frontend / カード入力を介さずに webhook を直接発火できます（state machine の動作確認に有用）:

```bash
# 任意の event を Stripe に投げて webhook を発火
docker compose exec stripe-cli stripe trigger payment_intent.succeeded
docker compose exec stripe-cli stripe trigger payment_intent.payment_failed
docker compose exec stripe-cli stripe trigger payment_intent.requires_action
```

これらは Stripe の test fixture を使った擬似 event で、実際に Stripe 側で PaymentIntent が作られて webhook が forward されます。我々の DB に該当 Transaction が無い場合は `StripeEventHandler` が no-op で返す（[StripeEventHandler.php:58](backend-laravel/app/Services/StripeEventHandler.php#L58)）ことの確認にも使えます。

### Stripe key の整理

3 種類の key を 2 つの env ファイルに配置します。**用途と prefix を取り違えると webhook 検証や API call が失敗する** ため整理:

| 環境変数 | 値の例 | 配置先 | 用途 |
| --- | --- | --- | --- |
| `STRIPE_API_KEY` | `sk_test_...` | `.env` (root) | `stripe-cli` が Stripe にログインするための secret key |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | `.env` (root) | frontend (Stripe.js) が Elements を初期化する公開 key |
| `STRIPE_SECRET_KEY` | `sk_test_...` (上と同値) | `backend-laravel/.env` | Laravel が Stripe API を叩く secret key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | `backend-laravel/.env` | **受信した webhook の HMAC 署名を検証する別物の鍵**。step 5 で取得 |

- `sk_test_...` と `whsec_...` は **完全に別の鍵**。値を入れ替えると webhook が常に 400 を返します
- compose env (root `.env`) は `stripe-cli` / frontend コンテナにだけ渡され、backend-laravel コンテナへは渡らない（backend は `backend-laravel/.env` を直接読む）ため、secret key を 2 箇所に書く運用になっています

### Stripe テストカード

3DS2 シナリオ別の検証で使用:

| カード番号 | 挙動 |
| --- | --- |
| `4242 4242 4242 4242` | フリクションレス通過 |
| `4000 0027 6000 3184` | 3DS2 challenge 必須 |
| `4000 0082 6000 3178` | 3DS2 challenge 失敗 |
| `4000 0000 0000 0002` | 一般 decline |

有効期限・CVC・郵便番号は任意の有効値で可（例: 12/34、123、`12345`）。

## テスト手順

すべて Docker コンテナ内で実行する。

### Backend (PHP)

```bash
# PHPUnit (MySQL test DB を RefreshDatabase で初期化、全 41 ケース)
docker compose exec backend-laravel php artisan test

# Pint: コードスタイル check (dry-run)
docker compose exec backend-laravel ./vendor/bin/pint --test

# PHPStan: 静的解析 level 8
docker compose exec backend-laravel ./vendor/bin/phpstan analyse
```

### Frontend (Vue 3)

```bash
# vitest: unit / integration テスト
docker compose exec frontend npx vitest run

# vue-tsc: TypeScript 型検査
docker compose exec frontend npm run type-check
```

### OpenAPI contract

```bash
# spectral: contract 自体の品質 lint (host で実行)
npx -y @stoplight/spectral-cli@latest lint docs/api-contract.yaml
```

### CI

GitHub Actions で push / PR ごとに自動実行。詳細は [`.github/workflows/`](.github/workflows/) 参照。

## 参照ドキュメント

- [Stripe - 3D Secure authentication](https://docs.stripe.com/payments/3d-secure)
- [Stripe - Payment Intents API](https://docs.stripe.com/api/payment_intents)
- [Stripe - Testing 3DS](https://docs.stripe.com/testing#regulatory-cards)
- [Stripe PHP SDK](https://github.com/stripe/stripe-php)
- [Stripe.js Reference](https://docs.stripe.com/js)
- EMVCo 公式仕様（[EMVCo](https://www.emvco.com/)）

## License

MIT License
