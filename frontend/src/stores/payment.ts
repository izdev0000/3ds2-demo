import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  confirmPayment,
  createPaymentIntent,
  type ConfirmationFlow,
  type PaymentIntentStatus,
} from '@/services/payment'
import {
  createOrder as apiCreateOrder,
  type CreateOrderRequest,
  type OrderResponse,
} from '@/services/order'
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
  orderId: string
  psp: PspClient
  flow?: ConfirmationFlow
  returnUrl?: string
} & ({ card: CardHandle } | { paymentMethodId: string })

export const usePaymentStore = defineStore('payment', () => {
  const phase = ref<PaymentPhase>('idle')
  const currentFlow = ref<ConfirmationFlow>('client_sdk')
  const order = ref<OrderResponse | null>(null)
  const paymentIntentId = ref<string | null>(null)
  const clientSecret = ref<string | null>(null)
  const finalStatus = ref<PaymentIntentStatus | null>(null)
  const errorMessage = ref<string | null>(null)

  // 決済試行 (Transaction) に関する state のみリセット。Order は保持して
  // 別カードで再決済できるようにする (1 Order : N Transaction)。
  function reset() {
    phase.value = 'idle'
    paymentIntentId.value = null
    clientSecret.value = null
    finalStatus.value = null
    errorMessage.value = null
  }

  // 注文ごと破棄して入力からやり直す。
  // 注: backend の Order レコードは pending のまま残る (墓場化)。
  // 本デモのスコープでは清掃しない (docs/design/error-handling.md §11)。
  function resetOrder() {
    order.value = null
    reset()
  }

  function fail(message: string) {
    errorMessage.value = message
    phase.value = 'failed'
  }

  // 仮注文を作成して store に保持する。続けて start() を呼ぶ前段階。
  // 失敗時は order=null のままで例外を rethrow する (form 側で表示)。
  async function createOrder(req: CreateOrderRequest): Promise<OrderResponse> {
    const res = await apiCreateOrder(req)
    order.value = res
    return res
  }

  async function start(args: StartPaymentArgs) {
    const { orderId } = args
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
        intent = await createPaymentIntent({ order_id: orderId })
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
    order,
    paymentIntentId,
    clientSecret,
    finalStatus,
    errorMessage,
    reset,
    resetOrder,
    createOrder,
    start,
  }
})
