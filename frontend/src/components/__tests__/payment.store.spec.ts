import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  PaymentIntentResult,
  Stripe,
  StripeCardNumberElement,
} from '@stripe/stripe-js'
import { usePaymentStore } from '@/stores/payment'
import * as paymentService from '@/services/payment'

const card = {} as StripeCardNumberElement

type ConfirmFn = Stripe['confirmCardPayment']
type NextActionFn = Stripe['handleNextAction']

function makeStripe(overrides: {
  confirm?: PaymentIntentResult
  next?: PaymentIntentResult
}): Stripe {
  return {
    confirmCardPayment: vi
      .fn<ConfirmFn>()
      .mockResolvedValue(overrides.confirm ?? ({} as PaymentIntentResult)),
    handleNextAction: vi
      .fn<NextActionFn>()
      .mockResolvedValue(overrides.next ?? ({} as PaymentIntentResult)),
  } as unknown as Stripe
}

function intent(status: string, id = 'pi_test') {
  return {
    paymentIntent: { id, status, client_secret: 'cs_test' },
  } as unknown as PaymentIntentResult
}

describe('payment store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.spyOn(paymentService, 'createPaymentIntent').mockResolvedValue({
      id: 'pi_test',
      client_secret: 'cs_test',
      status: 'requires_payment_method',
    })
  })

  it('初期 phase は idle', () => {
    const store = usePaymentStore()
    expect(store.phase).toBe('idle')
  })

  it('reset で全フィールドが初期化される', () => {
    const store = usePaymentStore()
    store.phase = 'failed'
    store.paymentIntentId = 'pi_test'
    store.errorMessage = 'boom'
    store.reset()
    expect(store.phase).toBe('idle')
    expect(store.paymentIntentId).toBeNull()
    expect(store.errorMessage).toBeNull()
  })

  it('frictionless: confirm が succeeded を返したら phase = succeeded', async () => {
    const store = usePaymentStore()
    const stripe = makeStripe({ confirm: intent('succeeded') })
    await store.start({ amount: 100, currency: 'jpy', stripe, card })
    expect(store.phase).toBe('succeeded')
    expect(store.finalStatus).toBe('succeeded')
    expect(stripe.handleNextAction).not.toHaveBeenCalled()
  })

  it('challenge: requires_action → handleNextAction → succeeded', async () => {
    const store = usePaymentStore()
    const stripe = makeStripe({
      confirm: intent('requires_action'),
      next: intent('succeeded'),
    })
    await store.start({ amount: 100, currency: 'jpy', stripe, card })
    expect(stripe.handleNextAction).toHaveBeenCalledWith({
      clientSecret: 'cs_test',
    })
    expect(store.phase).toBe('succeeded')
    expect(store.finalStatus).toBe('succeeded')
  })

  it('confirm でカード decline → phase = failed', async () => {
    const store = usePaymentStore()
    const stripe = {
      confirmCardPayment: vi
        .fn<ConfirmFn>()
        .mockResolvedValue({
          error: { message: 'card declined' },
        } as unknown as PaymentIntentResult),
      handleNextAction: vi.fn<NextActionFn>(),
    } as unknown as Stripe
    await store.start({ amount: 100, currency: 'jpy', stripe, card })
    expect(store.phase).toBe('failed')
    expect(store.errorMessage).toBe('card declined')
  })

  it('backend エラー → phase = failed', async () => {
    vi.spyOn(paymentService, 'createPaymentIntent').mockRejectedValue(
      new Error('500 backend down'),
    )
    const store = usePaymentStore()
    const stripe = makeStripe({})
    await store.start({ amount: 100, currency: 'jpy', stripe, card })
    expect(store.phase).toBe('failed')
    expect(store.errorMessage).toBe('500 backend down')
  })

  it('challenge 失敗 → phase = failed', async () => {
    const store = usePaymentStore()
    const stripe = {
      confirmCardPayment: vi
        .fn<ConfirmFn>()
        .mockResolvedValue(intent('requires_action')),
      handleNextAction: vi
        .fn<NextActionFn>()
        .mockResolvedValue({
          error: { message: 'auth failed' },
        } as unknown as PaymentIntentResult),
    } as unknown as Stripe
    await store.start({ amount: 100, currency: 'jpy', stripe, card })
    expect(store.phase).toBe('failed')
    expect(store.errorMessage).toBe('auth failed')
  })
})
