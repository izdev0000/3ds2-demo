# Order ライフサイクルとケースハンドリング設計

`Order.status` 単体では「pending の中身」を区別できない。実務では離脱・
失敗・処理中・webhook 遅延を別物として扱う必要があるため、本 doc で
分類と表示ポリシーを整理する。

実装の指針として書き、本デモでは Order の accessor と RecentRowsViewer
表示までを対象、UI context 別 scope は実務スコープとしてドキュメントに
留める。

## 1. 背景

`Order.status` は業務的に確定した状態（`pending` / `paid` / `canceled` /
`refunded`）を表す。しかし `pending` は次の 4 つの意味を内包する:

- ユーザーがカート確定後に決済を試みず離脱した
- 決済を試みたが失敗（decline / 認証失敗 / cancel）
- 決済処理中（3DS challenge / 銀行処理）
- Stripe では succeeded だが webhook が未着で DB 同期前

これらを一律「pending」と表示すると user / 経理 / 運用 で異なる混乱が
起きる。**Order と Transaction を分離する設計の自然な帰結として、経緯は
Transactions 側に分散する** ため、用途に応じて両者を JOIN して導出する。

## 2. lifecycle_state 分類

`Order.status` と紐づく Transactions の最新状態から導出する派生状態:

| lifecycle_state | 条件 | 業務的意味 |
| --- | --- | --- |
| `paid` | `orders.status = 'paid'` | 決済確定 |
| `canceled` | `orders.status = 'canceled'` | 明示キャンセル |
| `refunded` | `orders.status = 'refunded'` | 返金済 |
| `abandoned` | pending かつ Transactions 0 件 | カート確定のみで決済未試行 |
| `in_progress` | pending かつ最新 Tx が `requires_action` / `processing` | 3DS challenge / 銀行処理中 |
| `failed` | pending かつ最新 Tx が `requires_payment_method` / `canceled` | カード decline / 認証 NG |
| `webhook_delayed` | pending かつ最新 Tx が `succeeded` | Stripe 側は確定済、webhook 未着 (race window) |

`Order.status` を細分化（pending_abandoned / pending_failed ...）にはしない。
理由: Order が決済の詳細を直接持つと **業務確定と決済試行の分離が崩れる**
ため。導出に留める。

### 判別ロジック (擬似 SQL)

```sql
SELECT
  o.id,
  o.status AS order_status,
  COUNT(t.id) AS attempt_count,
  (
    SELECT t2.status FROM transactions t2
    WHERE t2.order_id = o.id
    ORDER BY t2.created_at DESC LIMIT 1
  ) AS latest_tx_status,
  CASE
    WHEN o.status = 'paid'      THEN 'paid'
    WHEN o.status = 'canceled'  THEN 'canceled'
    WHEN o.status = 'refunded'  THEN 'refunded'
    WHEN COUNT(t.id) = 0        THEN 'abandoned'
    WHEN (SELECT t2.status FROM transactions t2
          WHERE t2.order_id = o.id
          ORDER BY t2.created_at DESC LIMIT 1) = 'succeeded'
      THEN 'webhook_delayed'
    WHEN (SELECT t2.status FROM transactions t2
          WHERE t2.order_id = o.id
          ORDER BY t2.created_at DESC LIMIT 1)
         IN ('requires_action', 'processing')
      THEN 'in_progress'
    ELSE 'failed'
  END AS lifecycle_state
FROM orders o
LEFT JOIN transactions t ON t.order_id = o.id
GROUP BY o.id;
```

実装は Eloquent の accessor で同等処理を行う（§5 参照）。

## 3. UI コンテキスト × 表示マトリクス

| UI 文脈 | abandoned | failed | in_progress | webhook_delayed | paid |
| --- | --- | --- | --- | --- | --- |
| 購入履歴 | ❌ | ✅ (再決済導線) | ⚠️ 処理中表示・操作 disable | ❌ (数秒で paid に解決) | ✅ |
| カート / トップ promo | ✅ 「未払い注文」誘導 | ✅ 同上 | ⚠️ 同上 | ❌ | ❌ (履歴行き) |
| マイページ通知 | △ 任意 | ✅ 強調 | △ | ❌ | ❌ |
| 管理画面 / 運用 | ✅ 全部見える | ✅ | ✅ | ✅ | ✅ |
| 会計連携 | ❌ | ❌ | ❌ | ❌ (paid 待ち) | ✅ |

ポイント:

- **`webhook_delayed` をユーザーに見せると致命的** (二重課金リスク)。
  decisive は webhook で Order が paid に遷移するのを backend 側で待つ
- **`abandoned` を購入履歴に出すと混乱** (買っていないものが履歴に並ぶ)
- **`failed` は明示的な再決済導線とセットで出す**

## 4. 制御レイヤ

| レイヤ | 役割 |
| --- | --- |
| Backend (model scope) | `Order::scopeForUserContext($context)` 等で UI 文脈別に絞り込む。**「見せたくないものは backend で除外」** が原則 |
| API | endpoint or `?context=` でユーザー文脈を伝える (`GET /api/orders?context=purchase_history`) |
| Frontend | backend が返したものを表示するだけ。show/hide を frontend だけで判断しない (DOM 抑制では security にならない) |

「内部 (DB) に残す ≠ user に見せる」を明確に分離する。pending 行は監査・
分析のため **削除しない**。表示は scope で制御する。

## 5. 実装パターン

### 5.1 Order accessor (lifecycle_state 導出)

```php
// app/Models/Order.php
public function lifecycleState(): string
{
    return match ($this->status) {
        OrderStatus::PAID     => 'paid',
        OrderStatus::CANCELED => 'canceled',
        OrderStatus::REFUNDED => 'refunded',
        OrderStatus::PENDING  => $this->derivePendingSubState(),
    };
}

private function derivePendingSubState(): string
{
    $latest = $this->transactions()->latest('created_at')->first();
    if ($latest === null) {
        return 'abandoned';
    }
    return match ($latest->status) {
        PaymentStatus::SUCCEEDED                                  => 'webhook_delayed',
        PaymentStatus::REQUIRES_ACTION, PaymentStatus::PROCESSING => 'in_progress',
        default                                                    => 'failed',
    };
}
```

### 5.2 UI context 別 scope (実務想定)

本デモでは未実装。実務で書くなら下記イメージ:

```php
public function scopeForUserContext(Builder $q, string $context): Builder
{
    return match ($context) {
        'purchase_history' => $q->where(function ($q) {
            $q->where('status', 'paid')
              ->orWhere(function ($q) {
                  // 「失敗」「処理中」のみ pending を許可、abandoned / webhook_delayed は除外
                  $q->where('status', 'pending')
                    ->whereHas('transactions', fn ($t) =>
                        $t->whereIn('status', [
                            'requires_payment_method',
                            'requires_action',
                            'processing',
                        ]));
              });
        }),
        'cart_resume' => $q->where('status', 'pending')
            ->whereDoesntHave('transactions'), // 純粋な abandoned のみ
        'admin' => $q,
        default => $q->where('status', 'paid'),
    };
}
```

### 5.3 ケース別ハンドリング例

#### 5.3.1 離脱 (`abandoned`)

- 表示: カート画面で「お買い物の続きから」復帰導線、購入履歴には載せない
- backend: TTL を設けて N 日後に `canceled` に自動遷移 or 物理削除 (本デモは未実装、墓場として残す)
- 通知: 任意 (リマインドメール送信は CRM 領域)

#### 5.3.2 失敗 (`failed`)

- 表示: 購入履歴に「お支払いに失敗しました」+ 別カード入力導線
- backend: 同 Order に新規 Transaction を紐付ける (1 Order : N Transaction)
  ため `POST /api/payments` を再度受ける
- 通知: 即時メール (理由付き)

#### 5.3.3 処理中 (`in_progress`)

- 表示: 「処理中です」+ 再決済ボタンは disable
- backend: client は 3DS challenge を完了するか、`getPaymentIntent` で
  polling して resolve を待つ
- 自動 timeout: Stripe 側で `requires_action` は数十分で `payment_failed` に
  遷移するため、結果として `failed` に流れる (race は webhook で同期)

#### 5.3.4 webhook 遅延 (`webhook_delayed`)

- 表示: **ユーザー UI には出さない**。bool フラグで購入履歴等から除外
- backend: webhook は Stripe が exponential backoff で retry するため通常
  数秒で paid に解決。`reconciliation` job (本デモ未実装) で 72h 経過分は
  手動 redeliver 候補として alert を上げる
- 教育素材: 本デモの RecentRowsViewer に表示することで「frontend が
  succeeded を見ても backend は pending のままになる race window」を
  観察できる

## 6. 本デモのスコープ

| 項目 | 実装する | doc のみ | 実務スコープ |
| --- | --- | --- | --- |
| `Order::lifecycleState()` accessor | ✅ | | |
| RecentRowsViewer に lifecycle_state 表示 | ✅ | | |
| UI context 別 scope | | ✅ §5.2 | 実務で実装 |
| 購入履歴画面 / カート再開画面 | | | 実務で実装 |
| 離脱 Order の TTL / 自動キャンセル | | ✅ §5.3.1 | 実務で実装 |
| reconciliation job | | ✅ §5.3.4 | 実務で実装 |

「3DS2 + webhook 駆動 state machine を観察する」というデモのスコープ
内で、業務的に何を考えないといけないかを doc に残す。実装は最小限。

## 7. 関連設計

- [error-handling.md](./error-handling.md) §8 State Machine とエラーの関係
- [confirmation-flow.md](./confirmation-flow.md) Confirmation の責務分担
- [api-contract.yaml](../api-contract.yaml) OrderStatus / PaymentStatus 定義
