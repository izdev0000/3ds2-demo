import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Stripe, StripeCardNumberElement } from '@stripe/stripe-js'
import {
  createPaymentIntent,
  type PaymentIntentStatus,
} from '@/services/payment'

// Stripe Payment Intent status を EMVCo 3DS2 メッセージフローへマッピング。
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
  stripe: Stripe
  card: StripeCardNumberElement
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

  async function start({ amount, currency, stripe, card }: StartPaymentArgs) {
    reset()
    phase.value = 'preparing'

    let intent
    try {
      intent = await createPaymentIntent({ amount, currency })
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
      return
    }
    paymentIntentId.value = intent.id
    clientSecret.value = intent.clientSecret

    // handleActions: false で next_action を自動処理させず、status を明示的に検査する。
    const confirmRes = await stripe.confirmCardPayment(
      intent.clientSecret,
      { payment_method: { card } },
      { handleActions: false },
    )

    if (confirmRes.error) {
      fail(confirmRes.error.message ?? 'confirm に失敗')
      return
    }
    if (!confirmRes.paymentIntent) {
      fail('PaymentIntent が返却されませんでした')
      return
    }

    finalStatus.value = confirmRes.paymentIntent.status as PaymentIntentStatus

    if (finalStatus.value === 'requires_action') {
      phase.value = 'challenging'
      const challengeRes = await stripe.handleNextAction({
        clientSecret: intent.clientSecret,
      })
      if (challengeRes.error) {
        fail(challengeRes.error.message ?? 'challenge に失敗')
        return
      }
      finalStatus.value =
        (challengeRes.paymentIntent?.status as PaymentIntentStatus) ??
        finalStatus.value
    }

    if (finalStatus.value === 'succeeded') {
      phase.value = 'succeeded'
    } else {
      fail(`想定外の最終 status: ${finalStatus.value}`)
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
