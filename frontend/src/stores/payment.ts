import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  confirmPayment,
  createPaymentIntent,
  type ConfirmationFlow,
  type PaymentIntentStatus,
} from '@/services/payment'
import { release, tryAcquire } from '@/services/paymentLock'
import { navigation } from '@/services/navigation'
import type { CardHandle, PspClient } from '@/services/PspClient'

// PSP の payment status を EMVCo 3DS2 メッセージフローへマッピング。
// frictionless: idle → preparing(AReq/ARes) → succeeded
// challenge:    idle → preparing(AReq/ARes) → challenging(CReq/CRes) → succeeded
// 失敗:         任意の段階 → failed
// redirect:     idle → preparing → redirecting → (画面遷移) → PaymentReturn
export type PaymentPhase =
  | 'idle'
  | 'preparing'
  | 'challenging'
  | 'redirecting'
  | 'succeeded'
  | 'failed'

// docs/design/confirmation-flow.md の Strategy C: redirect 戻り URL に内部 ID を
// 含めるが、Stripe が他の query をどう保持するかは要実機確認のため、
// fallback (Strategy B) として sessionStorage にも保存しておく。
const REDIRECT_TXN_KEY = 'redirect-txn-id'

// card と paymentMethodId は XOR (どちらか一方を指定)。
// flow 未指定時は store.currentFlow を使う。
// flow=server_redirect の時は returnUrl 必須。
export type StartPaymentArgs = {
  amount: number
  currency: string
  psp: PspClient
  flow?: ConfirmationFlow
  returnUrl?: string
} & ({ card: CardHandle } | { paymentMethodId: string })

export const usePaymentStore = defineStore('payment', () => {
  const phase = ref<PaymentPhase>('idle')
  const currentFlow = ref<ConfirmationFlow>('client_sdk')
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

  async function start(args: StartPaymentArgs) {
    const { amount, currency } = args
    const flow = args.flow ?? currentFlow.value
    reset()

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

      if (flow === 'client_sdk') {
        await runClientSdkFlow(args, intent.client_secret)
      } else {
        await runServerRedirectFlow(args, intent.id)
      }
    } finally {
      release()
    }
  }

  async function runClientSdkFlow(
    args: StartPaymentArgs,
    intentClientSecret: string,
  ) {
    const paymentMethodArg =
      'paymentMethodId' in args
        ? { paymentMethodId: args.paymentMethodId }
        : { card: args.card }

    const result = await args.psp.confirmAndChallenge({
      clientSecret: intentClientSecret,
      ...paymentMethodArg,
      onChallenge: () => {
        phase.value = 'challenging'
      },
    })

    if (result.finalStatus !== undefined) {
      finalStatus.value = result.finalStatus as PaymentIntentStatus
    }
    if (result.kind === 'succeeded') {
      phase.value = 'succeeded'
    } else {
      fail(result.message)
    }
  }

  async function runServerRedirectFlow(
    args: StartPaymentArgs,
    intentId: string,
  ) {
    if (!args.returnUrl) {
      fail('flow=server_redirect には returnUrl が必須です')
      return
    }

    let pmId: string
    try {
      if ('paymentMethodId' in args) {
        pmId = args.paymentMethodId
      } else {
        const created = await args.psp.createPaymentMethod(args.card)
        pmId = created.paymentMethodId
      }
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
      return
    }

    // Strategy C: 内部 ID を return URL の query に乗せる。
    // Strategy B (fallback): sessionStorage にも保存。
    const url = new URL(args.returnUrl)
    url.searchParams.set('txn', intentId)
    const returnUrl = url.toString()
    sessionStorage.setItem(REDIRECT_TXN_KEY, intentId)

    let res
    try {
      res = await confirmPayment(intentId, {
        payment_method_id: pmId,
        return_url: returnUrl,
        flow: 'server_redirect',
      })
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
      return
    }

    if (res.status !== undefined) {
      finalStatus.value = res.status
    }

    if (
      res.next_action?.type === 'redirect_to_url' &&
      res.next_action.redirect_to_url
    ) {
      phase.value = 'redirecting'
      navigation.redirect(res.next_action.redirect_to_url.url)
      // ページ遷移するのでこの後の state 変更は無意味
      return
    }

    if (res.status === 'succeeded') {
      phase.value = 'succeeded'
    } else {
      fail(`想定外の confirm 結果: ${res.status}`)
    }
  }

  return {
    phase,
    currentFlow,
    paymentIntentId,
    clientSecret,
    finalStatus,
    errorMessage,
    reset,
    start,
  }
})
