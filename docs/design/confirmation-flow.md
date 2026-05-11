# Confirmation flow strategy: dual support

3DS2 の confirm 経路として **inline iframe（Stripe デフォルト）** と
**server-side redirect（日本 PSP の伝統的パターン）** の **両方を 1 つの backend
で扱える構造** にするための設計メモ。

実装着手前のスケッチであり、本 doc に従って backend / frontend / tests を
段階的にアップデートしていく。

## 1. 背景

### 3DS2 の 2 つの confirmation flow

EMVCo 仕様自体は AReq → ARes → CReq → CRes のメッセージフローで規定される
ものの、**最後の challenge を画面でどう表現するか** は実装者の選択肢が分かれる。

| 観点 | inline iframe (client-side) | server-side redirect |
| --- | --- | --- |
| 主導 | Stripe.js / PSP の JS SDK | backend |
| confirm 主体 | frontend (`stripe.confirmCardPayment`) | backend (`paymentIntents->confirm`) |
| `next_action.type` | `use_stripe_sdk` | `redirect_to_url` |
| UX | 画面内オーバーレイ + iframe（URL 変わらず） | issuer ページへ full redirect |
| 戻り経路 | iframe close → 同ページ続行 | issuer → `return_url` ページ |
| 主流派 | Stripe / Adyen / 欧米系 PSP 全般 | 日本 PSP（GMO-PG / SBPS / DGFT 等）* |

*日本 PSP の API 仕様は NDA 下で非公開だが、redirect 型がデファクトであることは
公開資料・各社の決済画面の挙動から確認できる。

### なぜ両対応するか

- **学習資料としての網羅性**: 国内 PSP で主流の redirect 型と、欧米 PSP で主流の
  inline iframe 型を 1 リポジトリ内で比較できる
- **Adapter パターンの正当化**: PSP 抽象化を「PSP 切替」だけでなく
  「flow 切替」レベルで動作する形で示す
- **state machine / webhook 設計の検証**: 経路が違っても同じ Transaction
  状態遷移に着地することを実機で確認できる

### 非ゴール

- 日本 PSP（GMO-PG / SBPS 等）の **API 互換実装** ではない（仕様非公開）
- 全 PSP の全 flow を網羅する汎用ライブラリではない（学習デモ）

## 2. 決定

### 2.1 採用する flow 識別子

`App\Enums\ConfirmationFlow`:

| case | value | 意味 |
| --- | --- | --- |
| `CLIENT_SDK` | `client_sdk` | frontend 側 SDK が iframe で challenge を表示する経路 |
| `SERVER_REDIRECT` | `server_redirect` | backend が confirm し、frontend は redirect URL に遷移する経路 |

Adapter は対応する flow のサブセットを宣言できる：

```php
public function supportedConfirmationFlows(): array; // ConfirmationFlow[]
```

### 2.2 API contract 変更

`ConfirmPaymentRequest` schema に `flow` フィールド追加:

```yaml
ConfirmPaymentRequest:
  required: [payment_method_id, flow]
  properties:
    payment_method_id: ...
    return_url:
      description: |
        flow=server_redirect の場合は必須。3DS2 challenge 完了後の戻り URL。
    flow:
      type: string
      enum: [client_sdk, server_redirect]
      description: |
        - client_sdk:      Stripe.js が iframe で 3DS2 challenge を表示
        - server_redirect: backend が confirm し、redirect URL を返す
```

backend 側 validation で「`flow=server_redirect` なら `return_url` 必須」を
enforce する。

### 2.3 Adapter 実装方針

`StripeAdapter::confirmPayment(string $id, ConfirmPaymentRequest $req, ConfirmationFlow $flow)`:

- 共通: `paymentIntents->confirm($id, ['payment_method' => $req->paymentMethodId])`
- `CLIENT_SDK`: `return_url` を渡さない（または無視）→ Stripe は
  `next_action.type = use_stripe_sdk` を返す
- `SERVER_REDIRECT`: `return_url` を必ず付与 → Stripe は redirect-based 認証経路を
  選択し `next_action.type = redirect_to_url` で URL を返す

実際の挙動は Stripe 側のロジックに依存するため、Adapter は flow を **hint** として
扱う設計にする（Stripe が想定外の next_action.type を返してきても response を素直に
返却する）。

### 2.4 Frontend 実装方針

#### タブ UI

`PaymentPage.vue` の上部に flow 切替タブ:

```
[ 💳 Inline (Stripe SDK) ] [ ↗ Redirect (Japanese PSP style) ]
```

- 状態は Pinia store（`usePaymentStore` の `currentFlow`）or props で管理
- カード入力 UI （PaymentForm.vue）は両 flow 共通、submit 時の経路だけ分岐

#### submit 経路

```ts
async function submit(flow: ConfirmationFlow) {
  if (flow === 'client_sdk') {
    // 既存ロジック: stripe.confirmCardPayment + handleNextAction
  } else {
    const pm = await stripe.createPaymentMethod({ type: 'card', card })
    const res = await api.confirmPayment(intent.id, {
      payment_method_id: pm.paymentMethod.id,
      return_url: window.location.origin + '/payments/return',
      flow: 'server_redirect',
    })
    if (res.next_action?.type === 'redirect_to_url') {
      window.location.href = res.next_action.redirect_to_url.url
    } else if (res.status === 'succeeded') {
      // 即時成功 (frictionless)
    }
  }
}
```

#### 戻り先 view

新規 `views/PaymentReturn.vue`（route: `/payments/return`）:

- URL の `?payment_intent` から内部 ID を逆引き
  - Stripe の return URL には `payment_intent`（Stripe ID）と `payment_intent_client_secret` が付与される
  - 内部 ID（`txn_...`）と Stripe ID（`pi_...`）の対応は backend 側の DB に存在
- backend `GET /api/payments/{id}` で最終 status を取得
- 結果表示（succeeded / failed / canceled）

`router/index.ts` に route 追加。

### 2.5 Webhook の取り回し（不変）

webhook 受信側は **flow 非依存**。flow に関わらず Stripe からは同一の event が
届く（`payment_intent.succeeded`, `payment_intent.payment_failed` 等）。
`StripeEventHandler` は変更なし。

### 2.6 State Machine の取り回し（不変）

`PaymentStatus` enum と Transaction の遷移は flow 非依存。両 flow とも：

```
requires_payment_method
  → requires_confirmation (frontend confirm 直前)
  → requires_action       (3DS2 challenge 中、inline / redirect 共通)
  → succeeded / canceled / requires_payment_method (失敗時)
```

EMVCo メッセージフロー（AReq → ARes → CReq → CRes）との対応も同一。

## 3. 影響範囲

### 3.1 Backend（私 = backend chat 担当）

| ファイル | 変更内容 |
| --- | --- |
| `app/Enums/ConfirmationFlow.php` | 新規。`CLIENT_SDK` / `SERVER_REDIRECT` |
| `app/DTO/ConfirmPaymentRequest.php` | `flow` フィールド追加（`?ConfirmationFlow`） |
| `app/Adapters/PaymentAdapterInterface.php` | `confirmPayment` 第 3 引数 `ConfirmationFlow` 追加、`supportedConfirmationFlows()` 追加 |
| `app/Adapters/StripeAdapter.php` | flow 別 branch、`return_url` 必須判定 |
| `app/Adapters/AdyenAdapter.php` | signature 揃える（中身は throw 維持） |
| `app/Http/Controllers/Api/PaymentController.php` | `flow` validation 追加、`server_redirect` 時の `return_url` required |
| `tests/Unit/DTO/ConfirmPaymentRequestTest.php` | `flow` フィールドテスト追加 |
| `tests/Feature/Services/StripeEventHandlerTest.php` | 不変（webhook 経路は flow 非依存） |

### 3.2 API contract（私 = backend chat 担当）

| ファイル | 変更内容 |
| --- | --- |
| `docs/api-contract.yaml` | `ConfirmPaymentRequest` に `flow` enum 追加、説明文更新 |
| `.spectral.yaml` | 不変 |

### 3.3 Frontend（frontend chat 担当）

| ファイル | 変更内容 |
| --- | --- |
| `frontend/src/components/PaymentFlowTabs.vue` | 新規、タブ UI |
| `frontend/src/views/PaymentPage.vue` | タブ統合、現在 flow を store に伝える |
| `frontend/src/components/PaymentForm.vue` | submit() で flow 別分岐 |
| `frontend/src/stores/payment.ts` | `currentFlow` state、`server_redirect` 経路追加 |
| `frontend/src/services/payment.ts` | `confirmPayment` で `flow` パラメータ送信 |
| `frontend/src/views/PaymentReturn.vue` | 新規、redirect 戻り先 view |
| `frontend/src/router/index.ts` | `/payments/return` route 追加 |
| `frontend/src/components/__tests__/*.spec.ts` | flow 別 case 追加 |

### 3.4 Docs（私 = backend chat 担当）

| ファイル | 変更内容 |
| --- | --- |
| `docs/architecture.md` | 「Confirmation flow strategy」セクション追加、本 doc へリンク |
| `docs/design/confirmation-flow.md` | 本ファイル（実装後も歴史記録として保持） |
| `README.md` | 「両 flow デモ」を一言追記（任意） |

### 3.5 CI（不変）

既存 workflow（backend-test / lint / phpstan、frontend-test / lint、openapi-drift）
で全部カバー。新規 workflow 不要。

## 4. 代替案（不採用）

### 4.1 単一 flow のまま（client_sdk のみ）

- pros: 実装最小
- cons: 日本 PSP 文脈を再現できない、demo の網羅性低下
- 不採用理由: 学習デモの主目的（domain 経験の demonstrate）に対して妥協が大きすぎる

### 4.2 redirect のみ（client_sdk 廃止）

- pros: 日本 PSP に寄せた一貫性
- cons: 既存の動作する client_sdk 実装を捨てる、Stripe デフォルトの良さを示せない
- 不採用理由: せっかく動く実装を消すコストが見合わない

### 4.3 PaymentAdapterInterface に分けず、別 method に

例: `confirmPaymentInline(...)` と `confirmPaymentRedirect(...)` を別メソッド化

- pros: signature が単純（`flow` 引数不要）
- cons: 共通処理（DB 引き、レスポンス構築）が二重化、メソッド爆発
- 不採用理由: 単一 `confirmPayment(id, dto, flow)` のほうが Adapter 抽象として
  cleaner（Stripe 側で実際の実装は分岐するが、interface としては 1 メソッド）

### 4.4 HTTP path で分ける（`/api/payments/{id}/confirm/redirect`）

- pros: REST 的に明示的
- cons: 同一 resource (PaymentIntent) を表現するのに endpoint を増やす不経済
- 不採用理由: flow は confirm の **オプション** であり、別 resource ではない

## 5. 工数見積

| 領域 | 工数 |
| --- | --- |
| 設計 doc（本ファイル + architecture.md 拡張） | 30min（本コミット時に近い完了） |
| Backend (`ConfirmationFlow` enum + Adapter / DTO / Controller / contract) | 1.5h |
| Frontend (タブ UI + 両 flow ロジック + return view + router) | 2.5h |
| Tests (両 flow 網羅) | 1h |
| 統合動作確認 + Demo シナリオ作成 + GIF 撮影 | 1h |
| **合計** | **~6.5h** |

## 6. ロールアウト順序

1. **本 doc commit**（決定の確定）
2. **私（backend chat）が backend + contract を実装** → commit & push
3. **frontend chat に引き継ぎ**（contract 確定済みなので手戻り無し）
4. **frontend chat が タブ UI + redirect path 実装**
5. **両 flow で実機動作確認**（Stripe テストカード `4000002760003184` で両 flow 試行）
6. **architecture.md に flow 切替セクション追加 + 本 doc へリンク**（私）
7. **README に "両 flow demonstrate" の一言** + GIF（任意、私 or 共同）

## 7. 動作確認シナリオ

両 flow を同じ Transaction / webhook 経路へ着地させ、Adapter / State Machine が
flow 非依存に動くことを確認する。

```
1. [Inline] タブ → テストカード 4000002760003184 入力 → 決済
   → 画面内に黒オーバーレイ + iframe 出現 → "Complete" → 同ページに戻る
   → DB の transactions.status が succeeded に遷移 (webhook 経由)

2. [Redirect] タブに切替 → 同じテストカード → 決済
   → issuer 風ページへ画面遷移 → 認証 → return_url へリダイレクト
   → DB の transactions.status が succeeded に遷移 (webhook 経由)

3. 両 flow とも webhook_events に payment_intent.* event が記録され、
   GET /api/payments/{id}/events で時系列に取得できる
```

## 8. 後続検討項目

### 8.1 PaymentReturn.vue での内部 ID 逆引き → **実装済**

`?payment_intent` から内部 transaction ID を逆引きするための 3 案を検討し、
**案 C（return_url に query 付与）を主、案 B（sessionStorage）をフォールバック**
として両方実装済 ([`stores/payment.ts`](../../frontend/src/stores/payment.ts) /
[`views/PaymentReturn.vue`](../../frontend/src/views/PaymentReturn.vue)):

- **案 C (実装済)**: `return_url` に `?txn=txn_xxx` を付与して Stripe をパススルー
  - frontend 側で URL を組み立て、Stripe が変更せずに issuer 経由で戻すことを期待
- **案 B (実装済、フォールバック)**: `sessionStorage` に `redirect-txn-id` キーで内部 ID を保存
  - 案 C が動かない場合（Stripe の挙動次第）の保険として併用
- 案 A (`GET /api/payments/by-stripe-id/{pi_xxx}`) は実装せず

`PaymentReturn` は query → sessionStorage の順で内部 ID を解決し、
`GET /api/payments/{id}` で結果を取得する。

### 8.2 Adapter::supportedConfirmationFlows() の要否

現状 Stripe のみ実装で Adyen はスタブのため、interface への追加は見送り。
Adyen を本格実装する段階で再検討する。
