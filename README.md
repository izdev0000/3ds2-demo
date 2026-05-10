# 3ds2-demo-php-laravel

EMV 3-D Secure 2.x の統合学習デモ。**Laravel 12 + Vue 3 + Stripe TEST 環境**による実動作版です。

> ⚠️ **Disclaimer**
> 本リポジトリは Stripe 公式の資産ではありません。学習目的の個人プロジェクトであり、Stripe, Inc. および関連企業との提携・スポンサー関係はいっさいありません。本番環境での利用は想定しておらず、実際の決済導入には Stripe 公式ドキュメントおよび公式 SDK を直接参照してください。

> 🚧 **WIP**: 現在開発中（Day 0 / 着手前）。

> 🤖 本リポジトリは [Claude Code]を活用して開発しています。設計・仕様判断は人間、ボイラープレート / 型定義 / テストケース生成は AI に委譲。エージェント向けの規約は [CLAUDE.md](./CLAUDE.md) を参照。

---

## 本リポジトリの位置づけ

- 決済ドメイン実務者の視点から、**EMVCo 標準仕様** と **Stripe API による 3DS2 統合** を整理した学習用実装
- 日本語による vendor-neutral な 3DS2 学習資料の不足を埋めることを目的とする
- 本番運用ライブラリではありません（実装時は Stripe 公式 SDK を直接利用してください）
- 日本 PSP（GMO-PG, SBPS 等）の統合ガイドではありません（非公開 API のため作成不可）
- EMVCo 仕様書の代替ではありません（仕様本体は EMVCo 公式文書を参照）

## 技術スタック

| レイヤ | 技術 |
| --- | --- |
| Backend | PHP 8.3 / **Laravel 12** / Stripe PHP SDK (`stripe/stripe-php`) |
| Frontend | **Vue 3** / TypeScript / Vite / Stripe.js + Stripe Elements |
| DB | MySQL 8 |
| Infra | Docker Compose |

## 設計の要点

- **Adapter パターン**で PSP を抽象化（`StripeAdapter` 実動作 + `AdyenAdapter` はスタブのみ）
- **Payment Intents API + `next_action` の明示的ハンドリング** を採用（Stripe.js の自動 iframe 任せにせず、3DS2 challenge 経路を制御）
- `request_three_d_secure: 'any'` で frictionless / challenge 両経路を検証
- **Webhook + HMAC 署名検証**（`Stripe-Signature`）を実装、実務感を反映
- トランザクション状態は明示的な **State Machine** で管理（Stripe Payment Intent state ↔ EMVCo 3DS2 メッセージフロー AReq → ARes → CReq → CRes をマッピング）

## 参照ドキュメント

- [Stripe - 3D Secure authentication](https://docs.stripe.com/payments/3d-secure)
- [Stripe - Payment Intents API](https://docs.stripe.com/api/payment_intents)
- [Stripe - Testing 3DS](https://docs.stripe.com/testing#regulatory-cards)
- [Stripe PHP SDK](https://github.com/stripe/stripe-php)
- [Stripe.js Reference](https://docs.stripe.com/js)
- EMVCo 公式仕様（[EMVCo](https://www.emvco.com/)）

## License

MIT License
