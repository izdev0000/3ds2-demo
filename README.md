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
- Stripe TEST アカウント（[Stripe Dashboard](https://dashboard.stripe.com/register) で gmail で即時発行可能）

### 手順

```bash
# 1. clone
git clone https://github.com/izdev0000/3ds2-demo.git
cd 3ds2-demo

# 2. .env を準備 (compose 用 / Laravel 用)
cp .env.example .env
cp backend-laravel/.env.example backend-laravel/.env
```

3. Stripe TEST の secret key を `backend-laravel/.env` の `STRIPE_SECRET_KEY` に設定
   （Dashboard → Developers → API keys から `sk_test_...` をコピー）

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

```bash
# 5. webhook signing secret を取得して backend-laravel/.env の
#    STRIPE_WEBHOOK_SECRET に転記、その後 backend を restart
docker compose logs stripe-cli | grep -i "webhook signing secret"
docker compose restart backend-laravel

# 6. APP_KEY 生成 + DB マイグレーション
docker compose exec backend-laravel php artisan key:generate
docker compose exec backend-laravel php artisan migrate
```

7. ブラウザで動作確認
   - frontend: http://localhost:5173
   - backend health: http://localhost:8000/up

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
