# Claude Code 規約 — 3ds2-demo-php-laravel

本ファイルは Claude Code がこのリポジトリで作業する際の規約。マスターハンドアウト（`../CLAUDE.md`）を前提とし、本実装固有の事項のみ記載する。

## 位置づけ

- 親: `../CLAUDE.md`（背景・キャリア戦略・NDA 制約・全体方針のマスター）
- 本リポ: PHP/Laravel + Vue 3 + **Stripe TEST** の単一実装
- 兄弟リポ予定: `3ds2-demo-java-spring` 等を後日追加

> Note: 当初は Adyen TEST を採用予定だったが、Adyen のセルフサービス TEST 登録が business メール / business website を必須とする仕様変更により利用不可と判明したため、Stripe へピボット。Stripe は gmail OK・instant 発行で同等の 3DS2 機能を持つため学習デモ要件を満たす。

## 絶対 NG（NDA・法務）

- ❌ 日本 PSP（GMO-PG, SBPS, DGFT 等）の非公開 API 仕様への言及・参照・流用
- ❌ 実務で関わった特定加盟店・顧客社名の露出
- ❌ PSP（Stripe / Adyen 等）のロゴ・商標の埋め込み、公式提携を匂わせる表現（"Powered by Stripe" 等）
- ❌ 実カード番号、本番 API key のコミット
- ✅ 参照可: Stripe / Adyen の公開 Docs / EMVCo 公開仕様 / カードブランド公開資料のみ

## スタック（決定済み）

- Backend: PHP 8.3 / Laravel 12 / Stripe PHP SDK (`stripe/stripe-php`)
- Frontend: Vue 3 / TypeScript / Vite / Stripe.js (`@stripe/stripe-js`) + Stripe Elements
- DB: MySQL 8
- Infra: Docker Compose
- CI: GitHub Actions

## 未確定（決まり次第本ファイル更新）

- Docker 構成: Laravel Sail / 自前 docker-compose のどちらにするか
- Vue 統合方式: Inertia.js（Laravel に同居）/ API + 分離 SPA のどちらにするか

## コーディング規約

- PHP: PSR-12 準拠、PHPStan は導入後に最大レベル運用
- TypeScript: strict mode、ESLint 必須
- 外部 API（Stripe / Adyen 等）レスポンスは DTO へマッピングしてから利用
- 秘密情報は `.env`、ハードコード禁止

## アーキテクチャ原則

- PSP 統合は Adapter パターン（`PaymentAdapterInterface` + `StripeAdapter` 実装、`AdyenAdapter` はインターフェースのみのスタブ）
- Webhook は専用コントローラ、HMAC 署名検証必須（Stripe は `Stripe-Signature` ヘッダ）
- トランザクション状態は明示的 State Machine（Stripe Payment Intent state ↔ EMVCo 3DS2 メッセージフロー AReq → ARes → CReq → CRes をマッピングして可視化）
- Stripe は **Payment Intents API + `next_action` を明示的にハンドリング**（Stripe.js の自動 iframe 任せにせず、3DS2 challenge 経路を制御することで仕様理解の深さを示す）
- `payment_method_options.card.request_three_d_secure: 'any'` で frictionless / challenge 両経路をテスト

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
- README に AI 活用の事実を明記（透明性のため）
