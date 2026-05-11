# エラーハンドリング設計

3ds2-demo の API・内部処理におけるエラー分類、レスポンス形式、ログ戦略、
リトライポリシーをまとめた設計メモ。

実装の指針として書き、本 doc に従って `app/Exceptions/` 等を段階的に整備する。

## 1. 背景

決済システムは「失敗する前提」で設計する必要がある:

- カード decline / 3DS2 認証失敗 / ネットワーク断 / Stripe API 障害 / DB lock 競合
- 失敗の種類によって user / 運用者 / Stripe 側それぞれの取り扱いが異なる
- silently 飲まれると `Transaction.status = succeeded` だが `Order.status = pending`
  のような不整合に直結する

本デモでは **失敗パターンを 6 分類して、レスポンス形式と retry 方針を統一** する。

## 2. エラー分類（Taxonomy）

| 分類 | HTTP | retry | ログ | 例 |
| --- | --- | --- | --- | --- |
| **A. 入力検証失敗** | 400 / 422 | ✗ | info | amount < 50、不正な currency、`flow=server_redirect` で `return_url` 欠落 |
| **B. リソース不在** | 404 | ✗ | info | 存在しない `transaction_id` / `order_id` |
| **C. 業務ルール違反** | 409 / 422 | ✗ | warning | succeeded 済 Transaction を再 confirm、canceled を refund |
| **D. 外部サービス失敗** | 429 / 502 | ✓ | error | Stripe API 5xx、`ApiConnectionException`、rate limit |
| **E. 認証・認可** | 400 / 401 / 403 | ✗ | warning | webhook 署名検証失敗 |
| **F. 内部エラー** | 500 | webhook 経路は ✓ | error / critical | DB 接続断、想定外例外 |

### Retry 責任分界

| 失敗の主体 | retry を誰がやるか |
| --- | --- |
| client → 我々の API | client が判断（4xx は無意味、5xx はバックオフ retry） |
| Stripe → 我々の webhook | **Stripe が exponential backoff で retry**。我々は 5xx を返しておけばよい |
| 我々の backend → Stripe API | **我々が retry する責任**（短時間バックオフ 1〜2 回、その後諦める） |

## 3. レスポンス形式

すべての 4xx / 5xx で同一の JSON envelope を返す:

```json
{
  "code": "string (snake_case)",
  "message": "string (人間可読)",
  "details": { /* 任意の追加情報 */ }
}
```

`docs/api-contract.yaml` の `Error` schema と一致。

| field | 用途 |
| --- | --- |
| `code` | API consumer が機械的に分岐するためのキー |
| `message` | UI 表示用テキスト（必要に応じて i18n key 化） |
| `details` | 障害調査用コンテキスト（PaymentIntent ID、Stripe `decline_code` 等） |

## 4. エラーコード一覧

| code | HTTP | 分類 | 意味 |
| --- | --- | --- | --- |
| `validation_failed` | 422 | A | Laravel `validate()` の組み合わせ違反、`details.errors` に field 別 messages |
| `invalid_amount` | 422 | A | 下限未満（50 未満）等 |
| `invalid_currency` | 422 | A | ISO 4217 不正 |
| `payment_not_found` | 404 | B | `transaction_id` 不在 |
| `order_not_found` | 404 | B | `order_id` 不在 |
| `payment_already_confirmed` | 409 | C | succeeded 済を再 confirm |
| `payment_already_canceled` | 409 | C | canceled 済を再操作 |
| `payment_not_refundable` | 422 | C | succeeded でないものを refund |
| `signature_verification_failed` | 400 | E | Stripe webhook 署名検証失敗 |
| `stripe_card_declined` | 422 | D→A 変換 | カード decline、`details.decline_code` 付き |
| `stripe_authentication_failed` | 422 | D→A 変換 | 3DS2 認証失敗 |
| `stripe_rate_limited` | 429 | D | Stripe API rate limit、`Retry-After` ヘッダ尊重 |
| `stripe_api_error` | 502 | D | 上記以外の Stripe 失敗 |
| `internal_error` | 500 | F | 想定外例外 |

## 5. Stripe エラー → ドメイン例外マッピング

`stripe-php` の例外階層と HTTP マッピング:

| Stripe Exception | 我々の HTTP | code | retry |
| --- | --- | --- | --- |
| `\Stripe\Exception\CardException` | 422 | `stripe_card_declined`（`decline_code` 別） | ✗ |
| `\Stripe\Exception\AuthenticationException` | 500 | `internal_error`（我々の API key 問題） | ✗ |
| `\Stripe\Exception\RateLimitException` | 429 | `stripe_rate_limited` | ✓（`Retry-After`） |
| `\Stripe\Exception\InvalidRequestException` | 400 | `invalid_request` | ✗ |
| `\Stripe\Exception\ApiConnectionException` | 502 | `stripe_api_error` | ✓（1〜2 回 backoff） |
| `\Stripe\Exception\ApiErrorException`（残り） | 502 | `stripe_api_error` | ✓ |
| `\Stripe\Exception\SignatureVerificationException` | 400 | `signature_verification_failed` | ✗（webhook） |

`StripeAdapter` 内で try/catch、ドメイン例外にラップして bubble:

```php
try {
    $intent = $this->stripe->paymentIntents->create([...]);
} catch (\Stripe\Exception\CardException $e) {
    throw new CardDeclinedException(
        declineCode: $e->getDeclineCode(),
        message: $e->getMessage(),
        previous: $e,
    );
} catch (\Stripe\Exception\ApiConnectionException $e) {
    throw new StripeUnreachableException(previous: $e);
}
```

`bootstrap/app.php` の `withExceptions()` で各ドメイン例外 → JSON envelope を整形。

## 6. retry / idempotency 戦略

### 6.1 backend → Stripe API

- `ApiConnectionException` / `ApiErrorException` (5xx): **最大 1 回 retry**（線形 1s 待機）
- それ以外: 即時失敗
- retry 時は **Stripe Idempotency-Key 必須**（重複 PaymentIntent 作成防止）

```php
$key = (string) Str::ulid();
$intent = $this->retryOnTransient(
    fn () => $this->stripe->paymentIntents->create(
        [...],
        ['idempotency_key' => $key],
    ),
);
```

`retryOnTransient` ヘルパは `app/Support/StripeRetry.php` に置く想定（未実装）。

### 6.2 Webhook 受信

- 我々のロジックが失敗 → **5xx を返す** → **Stripe が exponential backoff で retry**
- `(psp, psp_event_id)` UNIQUE で重複処理防止（実装済み、Y3-6）
- 処理は DB transaction 内に閉じて部分的成功を防ぐ（実装済み、Y3-6）
- retry してもダメなら Stripe Dashboard で手動 redeliver できる

### 6.3 Frontend → Backend API

- 4xx: retry 無意味、user に message 表示
- 5xx: 1〜2 回 retry、それでもダメなら "later please try again" 表示
- POST 系は **client 生成 Idempotency-Key（UUID）を header で送る** 運用が望ましい
  - 現状未実装、後続の `docs/design/idempotency.md` で別途設計予定

## 7. ログ戦略

### 7.1 構造化ログ

すべての payment 関連ログは構造化フィールドを必ず付与する:

```php
Log::channel('payment')->warning('webhook signature failed', [
    'event_id_header' => substr($signature, 0, 32),
    'remote_ip'       => $request->ip(),
    'received_at'     => now()->toIso8601String(),
    'error'           => $e->getMessage(),
]);
```

`payment` チャネルは `config/logging.php` で別出力（後述、未実装）。

### 7.2 ログレベル方針

| レベル | 用途 |
| --- | --- |
| `debug` | 通常 flow の詳細（本番では off） |
| `info` | 主要イベントの marker（PaymentIntent 作成、succeeded 受信、refund 完了） |
| `warning` | 復旧可能な失敗（validation 違反、署名失敗、業務ルール違反） |
| `error` | retry 対象の失敗（Stripe 5xx、DB 接続断） |
| `critical` | 復旧不可・人手介入要（DB 整合性破壊、Stripe API key 失効） |

### 7.3 必須コンテキストフィールド

Transaction 関連のログには少なくとも以下を必ず添付:

- `transaction_id`（内部 ID）
- `order_id`（紐づく Order の内部 ID）
- `psp`（`stripe`）
- `psp_payment_intent_id`（`pi_…`）
- `event_id`（該当する webhook event の Stripe ID）

これにより `transaction_id=txn_xxx` で grep するだけで lifecycle 全体を再構成できる。

### 7.4 個人情報・カード情報の扱い

| カテゴリ | ログ可否 |
| --- | --- |
| カード番号 / CVC / 有効期限 | ❌ そもそも我々の backend に届かない（Stripe.js / Elements 経由） |
| Stripe secret key (`sk_live_…`, `sk_test_…`) | ❌ 絶対書かない |
| Webhook secret (`whsec_…`) | ❌ 絶対書かない |
| `payment_method_id` (`pm_…`) | ⚠️ public key 相当だが本番ログでは避ける |
| `PaymentIntent` ID (`pi_…`) | ✅ public、ログ可 |

`Log::warning(... ['stripe_secret' => env('STRIPE_SECRET_KEY')])` は **絶対に書かない**。
mask の二重防御は config / log channel 側で。

## 8. State Machine とエラーの関係

### 8.1 確定状態への遷移

| 状態 | 入りやすい入口 | 出られない |
| --- | --- | --- |
| `succeeded` | `payment_intent.succeeded` webhook | 終端（refund しても `Transaction.status` は succeeded のまま、`Order.status` のみ `refunded`） |
| `canceled` | `paymentIntents->cancel` 呼び出し or `payment_intent.canceled` webhook | 終端 |
| `requires_action` | confirm 呼び出しで 3DS2 必要時 | 一定時間後に issuer timeout で `payment_failed` へ |
| `processing` | confirm 後の銀行処理中 | 数秒〜数分で succeeded or payment_failed |

### 8.2 エラー時の遷移ルール

| 状況 | Transaction.status | Order.status |
| --- | --- | --- |
| confirm で `CardException` | `requires_payment_method` のまま | `pending` のまま |
| cancel で「既に canceled」 | `canceled` に DB 同期（Stripe を真値とする） | `canceled` に同期 |
| webhook 処理で例外 | DB transaction rollback、何も変わらない | 何も変わらない |
| webhook で `payment_intent.payment_failed` | `requires_payment_method` 等に同期 | `pending` のまま（再決済可能） |

### 8.3 不整合検知

- `Transaction.status` と Stripe 側 `PaymentIntent.status` のずれを定期チェック（本デモではスコープ外）
- 万一ずれていたら `Log::critical('payment status drift', [...])` + 管理者通知（実装する場合）
- `Order.status` の `pending` には複数の意味（離脱 / 失敗 / 処理中 / webhook 遅延）
  が含まれるため、内訳分類と UI 表示ポリシーは [order-lifecycle.md](./order-lifecycle.md) §2 / §3 を参照

## 9. Frontend 側の取り扱い

### 9.1 エラー UI 方針

| code | UX |
| --- | --- |
| `validation_failed` | フォーム上にフィールド別エラーメッセージ |
| `payment_not_found` | "決済が見つかりません" + 戻るボタン |
| `stripe_card_declined` | "カードが拒否されました（${decline_code}）" + 別カード入力誘導 |
| `stripe_authentication_failed` | "3DS2 認証に失敗しました" + retry / 別カード |
| `stripe_rate_limited` | "混み合っています、少し待ってください" + 自動 retry |
| `internal_error` / `stripe_api_error` | "問題が発生しました" + 数秒後 retry or サポート連絡 |

### 9.2 client 側 retry

- 5xx + `Retry-After` あり → ヘッダ値で待機して 1 回 retry
- 5xx + `Retry-After` なし → 線形 backoff（1s, 2s）で最大 2 回
- 4xx → 即停止して UX 表示

## 10. テスト観点

| 観点 | テスト方法 |
| --- | --- |
| validation 違反 → 422 + 適切な code | Feature test (PaymentControllerTest) |
| 不存在 transaction → 404 | 同上 |
| `StripeAdapter::cancel` が succeeded を弾く | Unit test（Stripe mock） |
| webhook 署名失敗 → 400 | Feature test (WebhookControllerTest) |
| 同一 event 二重受信 → 204（no-op） | Feature test（StripeEventHandlerTest 拡張） |
| Stripe API 5xx → 502 + retry trace | Mock-based Unit test |

現状のテスト網羅は **約 50%**（StripeAdapter の mock テストは未実装）。後続 phase で
`StripeAdapter` の mock 化と Feature テスト追加を検討。

## 11. 既知の未対応・後続検討

- [ ] **Idempotency-Key（client → backend）**: 二重 submit を Layer 2 で防ぐ
  → 後続 `docs/design/idempotency.md` で設計
- [ ] **専用ログチャネル `payment`**: `config/logging.php` + 出力先（ファイル / stdout）
  → 実装後 README に記載
- [ ] **Outbox pattern**: webhook 処理後の外部通知（メール送信等）と DB の atomic 性
  → 現状デモに通知機能なし、不要
- [ ] **Dead letter queue**: 連続 retry 失敗 webhook の墓場
  → Laravel queue + `failed_jobs` テーブルで対応可、demo では未配備
- [ ] **Audit log**: 誰がいつ何を確認したか（PCI 観点）
  → 現状 `Log::info` で代替、専用テーブルは未
- [ ] **`decline_code` → user 向け i18n 辞書**: 各 decline_code 別の説明文を整備

## 12. 実装ロードマップ（本 doc 確定後）

| 順 | 内容 | 工数 |
| --- | --- | --- |
| 1 | `app/Exceptions/PaymentException.php` 基底 + `CardDeclinedException` 等の具体例外 | 30 min |
| 2 | `bootstrap/app.php` の `withExceptions()` で JSON envelope 整形 | 30 min |
| 3 | `StripeAdapter` の Stripe Exception → ドメイン例外 wrap | 1 h |
| 4 | `app/Support/StripeRetry.php` で transient retry helper | 30 min |
| 5 | `config/logging.php` に `payment` チャネル + 構造化ログを既存呼出に注入 | 1 h |
| 6 | Feature テスト追加（エラー code を網羅） | 1 h |
|   | **合計** | **~4.5 h** |

## 13. 関連設計

- [confirmation-flow.md](./confirmation-flow.md): 両 flow の責務分担とエラー時挙動の前提
- [order-lifecycle.md](./order-lifecycle.md): pending Order の内訳と UI 表示ポリシー (本 doc §8.3 から派生)
- [../architecture.md](../architecture.md): 全体構造とエラーが流れる経路
- [../api-contract.yaml](../api-contract.yaml): `Error` schema の本体
