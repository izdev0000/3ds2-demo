import {
  loadStripe,
  type Stripe,
  type StripeCardNumberElement,
  type StripeElements,
} from '@stripe/stripe-js'
import type {
  ConfirmAndChallengeArgs,
  ConfirmResult,
  MountCardFormOptions,
  MountCardFormTargets,
  MountedCardForm,
  PspClient,
} from './PspClient'

export class StripePspClient implements PspClient {
  private stripePromise: Promise<Stripe | null> | null = null
  private stripe: Stripe | null = null

  async init(): Promise<void> {
    if (this.stripe) return
    if (!this.stripePromise) {
      const pk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
      if (!pk) throw new Error('VITE_STRIPE_PUBLISHABLE_KEY が未設定です')
      this.stripePromise = loadStripe(pk)
    }
    this.stripe = await this.stripePromise
    if (!this.stripe) throw new Error('Stripe.js の初期化に失敗しました')
  }

  async mountCardForm(
    targets: MountCardFormTargets,
    options?: MountCardFormOptions,
  ): Promise<MountedCardForm> {
    await this.init()
    if (!this.stripe) throw new Error('Stripe 未初期化')

    const elements: StripeElements = this.stripe.elements()
    const cardNumber = elements.create('cardNumber', {
      placeholder: options?.placeholders?.number,
    })
    const cardExpiry = elements.create('cardExpiry', {
      placeholder: options?.placeholders?.expiry,
    })
    const cardCvc = elements.create('cardCvc', {
      placeholder: options?.placeholders?.cvc,
    })
    cardNumber.mount(targets.number)
    cardExpiry.mount(targets.expiry)
    cardCvc.mount(targets.cvc)

    return {
      // confirmAndChallenge は cardNumber を Stripe.js に渡せば
      // 同一 Elements インスタンスの cardExpiry / cardCvc を自動連携する。
      card: cardNumber,
      unmount: () => {
        cardNumber.unmount()
        cardExpiry.unmount()
        cardCvc.unmount()
      },
    }
  }

  async confirmAndChallenge(args: ConfirmAndChallengeArgs): Promise<ConfirmResult> {
    if (!this.stripe) throw new Error('Stripe 未初期化')
    const cardElement = args.card as StripeCardNumberElement

    // handleActions: false で next_action を自動処理させず、status を明示的に検査する。
    const confirmRes = await this.stripe.confirmCardPayment(
      args.clientSecret,
      { payment_method: { card: cardElement } },
      { handleActions: false },
    )
    if (confirmRes.error) {
      return {
        kind: 'failed',
        message: confirmRes.error.message ?? 'confirm に失敗',
      }
    }
    if (!confirmRes.paymentIntent) {
      return {
        kind: 'failed',
        message: 'PaymentIntent が返却されませんでした',
      }
    }

    let status: string = confirmRes.paymentIntent.status

    if (status === 'requires_action') {
      args.onChallenge?.()
      const challengeRes = await this.stripe.handleNextAction({
        clientSecret: args.clientSecret,
      })
      if (challengeRes.error) {
        return {
          kind: 'failed',
          message: challengeRes.error.message ?? 'challenge に失敗',
          finalStatus: status,
        }
      }
      status = challengeRes.paymentIntent?.status ?? status
    }

    if (status === 'succeeded') {
      return { kind: 'succeeded', finalStatus: status }
    }
    return {
      kind: 'failed',
      message: `想定外の最終 status: ${status}`,
      finalStatus: status,
    }
  }
}

// 利用側は default の singleton を import する。
// テストでは vi.spyOn(stripePspClient, 'mountCardForm') 等で個別 method を差し替え。
export const stripePspClient = new StripePspClient()
