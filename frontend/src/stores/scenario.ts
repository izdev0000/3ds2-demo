import { defineStore } from 'pinia'
import { ref } from 'vue'

// 教育デモ用 scenario id。frontend mock で人工的に失敗 / 遅延を再現する。
//
// "normal" 以外を選択中は、services 層が backend を呼ぶ前に意図的に
// reject / 遅延 / 状態書き換えを行う。Stripe TEST 環境では決済 decline /
// 3DS challenge fail はテストカードでカバー済なので、ここではそれ以外の
// 「実環境では起きうるが Stripe テストカードで再現できない」失敗を扱う。
export type ScenarioId =
  | 'normal'
  | 'abandon_after_success'
  | 'order_create_500'
  | 'payments_500'
  | 'stripe_5xx'
  | 'webhook_delay'

export interface ScenarioMeta {
  id: ScenarioId
  label: string
  description: string
}

export const SCENARIOS: ScenarioMeta[] = [
  {
    id: 'normal',
    label: '正常',
    description: 'バックエンド・Stripe を実際に経由する通常 flow',
  },
  {
    id: 'order_create_500',
    label: 'Order 作成中にシステムエラー',
    description:
      'POST /api/orders が 500。注文 DB レコードが作られないため、決済セクションが active にならない',
  },
  {
    id: 'payments_500',
    label: 'POST /payments が 500',
    description:
      'PaymentIntent 作成 API が 500。Order はあるが Transaction が作られない',
  },
  {
    id: 'stripe_5xx',
    label: 'Stripe confirm が 5xx',
    description:
      'Stripe SDK の confirmAndChallenge が落ちるケース。再決済導線を確認',
  },
  {
    id: 'webhook_delay',
    label: 'webhook 遅延',
    description:
      'Stripe succeeded を frontend が受け取った後も Order が pending のまま (webhook 未着)。webhook = single source of truth を体感',
  },
  {
    id: 'abandon_after_success',
    label: '決済成功直後に離脱',
    description:
      'frontend が結果を見ずブラウザ閉じる想定。「user が居なくても webhook で完了する」前提を可視化',
  },
]

export const useScenarioStore = defineStore('scenario', () => {
  const current = ref<ScenarioId>('normal')

  function pick(id: ScenarioId) {
    current.value = id
  }

  return { current, pick }
})
