import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  createPaymentIntent,
  type PaymentIntentStatus,
} from '@/services/payment'
import { release, tryAcquire } from '@/services/paymentLock'
import type { CardHandle, PspClient } from '@/services/PspClient'

// PSP の payment status を EMVCo 3DS2 メッセージフローへマッピング。
// frictionless: idle → preparing(AReq/ARes) → succeeded
// challenge:    idle → preparing(AReq/ARes) → challenging(CReq/CRes) → succeeded
// 失敗:         任意の段階 → failed
export type PaymentPhase =
  | 'idle'
  | 'preparing'
  | 'challenging'
  | 'succeeded'
  | 'failed'

export interface StartPaymentArgs {
  amount: number
  currency: string
  psp: PspClient
  card: CardHandle
}

export const usePaymentStore = defineStore('payment', () => {
  const phase = ref<PaymentPhase>('idle')
  const paymentIntentId = ref<string | null>(null)
  const clientSecret = ref<string | null>(null)
  const finalStatus = ref<PaymentIntentStatus | null>(null)
  const errorMessage = ref<string | null>(null)

  function reset() {
    phase.value = 'idle'
    paymentIntentId.value = null
    clientSecret.value = null
    finalStatus.value = null
    errorMessage.value = null
  }

  function fail(message: string) {
    errorMessage.value = message
    phase.value = 'failed'
  }

  async function start({ amount, currency, psp, card }: StartPaymentArgs) {
    reset()

    // 別 tab で決済が in-flight ならここで弾く (重複決済防止)。
    if (!tryAcquire()) {
      fail('別 tab で決済処理中のため受け付けられません')
      return
    }
    phase.value = 'preparing'

    try {
      let intent
      try {
        intent = await createPaymentIntent({ amount, currency })
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e))
        return
      }
      paymentIntentId.value = intent.id
      clientSecret.value = intent.client_secret

      const result = await psp.confirmAndChallenge({
        clientSecret: intent.client_secret,
        card,
        onChallenge: () => {
          phase.value = 'challenging'
        },
      })

      // PSP 由来の生 status を表示用に保持。型は契約と一致する想定だが、
      // PSP 抽象化の境界なので as でキャストする。
      if (result.finalStatus !== undefined) {
        finalStatus.value = result.finalStatus as PaymentIntentStatus
      }
      if (result.kind === 'succeeded') {
        phase.value = 'succeeded'
      } else {
        fail(result.message)
      }
    } finally {
      release()
    }
  }

  return {
    phase,
    paymentIntentId,
    clientSecret,
    finalStatus,
    errorMessage,
    reset,
    start,
  }
})
