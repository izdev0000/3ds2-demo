# Claude Code 規約 — 3ds2-demo

本ファイルは Claude Code がこのリポジトリで作業する際の規約。マスターハンドアウト（`../CLAUDE.md`）を前提とし、本実装固有の事項のみ記載する。

## 位置づけ

- 親: `../CLAUDE.md`（背景・キャリア戦略・NDA 制約・全体方針のマスター）
- 本リポ: **Vue 3 frontend × Laravel 12 backend × Stripe TEST** の monorepo 実装
- 構造方針: `frontend/` と `backend-*/` を sibling に配置、`docker-compose.yml` の profile で backend を切替
- 拡張可能性: 別言語 backend（Java / Go 等）を追加できる設計だが、**現時点では実装予定なし**（README に「予定」を書かない方針）

> Note: 当初は Adyen TEST を採用予定だったが、Adyen のセルフサービス TEST 登録が business メール / business website を必須とする仕様変更により利用不可と判明したため、Stripe へピボット。Stripe は gmail OK・instant 発行で同等の 3DS2 機能を持つため学習デモ要件を満たす。

## ディレクトリ構造

```
3ds2-demo/
├── README.md
├── CLAUDE.md               # 本ファイル（トップ規約）
├── LICENSE
├── .gitignore
├── docker-compose.yml      # profile 切替で backend 選択
├── .env.example
├── frontend/               # Vue 3 + TS + Vite + Stripe.js
│   ├── package.json
│   ├── src/
│   └── CLAUDE.md           # frontend 固有規約（必要に応じて作成）
├── backend-laravel/        # PHP 8.3 + Laravel 12 + Stripe PHP SDK
│   ├── composer.json
│   ├── src/
│   └── CLAUDE.md           # Laravel 固有規約（必要に応じて作成）
├── docker/                 # Dockerfile / nginx 設定等
│   ├── frontend/
│   └── backend-laravel/
└── docs/                   # 3DS2 仕様解説（言語非依存）
    ├── api-contract.yaml   # OpenAPI による API 契約定義
    └── 3ds2-overview.md
```

## 絶対 NG（NDA・法務）

- ❌ 日本 PSP（GMO-PG, SBPS, DGFT 等）の非公開 API 仕様への言及・参照・流用
- ❌ 実務で関わった特定加盟店・顧客社名の露出
- ❌ PSP（Stripe / Adyen 等）のロゴ・商標の埋め込み、公式提携を匂わせる表現（"Powered by Stripe" 等）
- ❌ 実カード番号、本番 API key のコミット
- ✅ 参照可: Stripe / Adyen の公開 Docs / EMVCo 公開仕様 / カードブランド公開資料のみ

## スタック（決定済み）

- Frontend: Vue 3 / TypeScript / Vite / Stripe.js (`@stripe/stripe-js`) + Stripe Elements
- Backend: PHP 8.3 / Laravel 12 / Stripe PHP SDK (`stripe/stripe-php`)
- DB: MySQL 8
- Infra: 自前 Dockerfile + docker-compose（Sail は monorepo と相性悪いため非採用）
- Webhook ローカル受信: Stripe CLI（`stripe listen --forward-to host.docker.internal:8000/webhooks/stripe`）
- CI: GitHub Actions
- API contract: OpenAPI 3.x で `docs/api-contract.yaml` に定義

## アーキテクチャ原則

- **API contract 駆動**: OpenAPI で frontend ↔ backend の境界を明示。backend が他実装に差し替わっても frontend 不変
- PSP 統合は **Adapter パターン**（`PaymentAdapterInterface` + `StripeAdapter` 実装、`AdyenAdapter` はインターフェースのみのスタブ）。frontend 側も `services/psp.ts` で同等の DI ポイントを持ち、component は具体実装を import しない
- **Order 駆動 (1 Order : N Transaction)**: 業務状態 (`orders.status`) と決済試行状態 (`transactions.status`) を分離。先に `pending` Order を作成し、`POST /api/payments` は `order_id` を必須にする。失敗時は同じ Order に新規 Transaction を紐付けて再決済を許容する
- **webhook = single source of truth**: `payment_intent.succeeded` 受信時に DB transaction 内で Transaction + Order を atomic 更新する。frontend の confirm response や redirect 戻りは UX 用 hint で業務確定の根拠ではない（詳細は `docs/design/error-handling.md` §8.4 / `docs/design/order-lifecycle.md`）
- Webhook は専用コントローラ、HMAC 署名検証必須（Stripe は `Stripe-Signature` ヘッダ）
- トランザクション状態は明示的 State Machine（Stripe Payment Intent state ↔ EMVCo 3DS2 メッセージフロー AReq → ARes → CReq → CRes をマッピングして可視化）
- Stripe は **Payment Intents API + `next_action` を明示的にハンドリング**（Stripe.js の自動 iframe 任せにせず、3DS2 challenge 経路を制御することで仕様理解の深さを示す）
- `payment_method_options.card.request_three_d_secure: 'any'` で frictionless / challenge 両経路をテスト

## コーディング規約

- PHP: PSR-12 準拠、PHPStan は導入後に最大レベル運用
- TypeScript: strict mode、ESLint 必須
- 外部 API（Stripe / Adyen 等）レスポンスは DTO へマッピングしてから利用
- 秘密情報は `.env`、ハードコード禁止
- API endpoint は OpenAPI 定義と一致させる（drift は CI で検出）

## コミット規約

- メッセージは日本語
- 意味単位で分割（短期間で完成しても 30〜50 コミット想定）
- 仕様引用時は出典明記（例: `EMVCo §6.2 に従い deviceChannel 相当を Payment Intent metadata に記録`）
- 判断・トレードオフはメッセージ本文で簡潔に補足

## ドキュメント規約

- メイン言語: 日本語
- 韓国語版は日本語ベース翻訳 + 韓国決済市場の文脈を補足
- 英語 README は簡潔に
- 仕様引用は必ず出典明記（EMVCo §X.Y、Stripe Docs URL、Adyen Docs URL）
- コード引用は最小、文書・図の比重を高く

## 不明点の扱い

- 仕様の解釈で迷った場合、推測実装せずユーザーに確認
- 命名・アーキテクチャの選択肢が複数ある場合、選択肢を提示して合意を取る
- ボイラープレート・型定義・定型テストは遠慮なく自走で生成

## AI 活用方針

- Claude Code に任せる: ボイラープレート、DTO、テストケース、定型コード生成
- 人間が判断: 仕様解釈、State Machine 設計、シナリオ分岐ロジック、アーキテクチャ判断
- README に AI 活用の事実を 1 行明記（透明性のため、ただし大々的なセクションは作らない）
