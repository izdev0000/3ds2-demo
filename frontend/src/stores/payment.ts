import { defineStore } from 'pinia'
import { ref } from 'vue'

// Stripe Payment Intent status を EMVCo 3DS2 メッセージフローへマッピング。
// frictionless: idle → preparing(AReq) → succeeded(ARes)
// challenge:    idle → preparing(AReq) → challenging(CReq/CRes) → succeeded
// 失敗:         任意の段階 → failed
export type PaymentPhase =
  | 'idle'
  | 'preparing'
  | 'challenging'
  | 'succeeded'
  | 'failed'

export const usePaymentStore = defineStore('payment', () => {
  const phase = ref<PaymentPhase>('idle')
  const paymentIntentId = ref<string | null>(null)
  const clientSecret = ref<string | null>(null)
  const errorMessage = ref<string | null>(null)

  function reset() {
    phase.value = 'idle'
    paymentIntentId.value = null
    clientSecret.value = null
    errorMessage.value = null
  }

  return {
    phase,
    paymentIntentId,
    clientSecret,
    errorMessage,
    reset,
  }
})
