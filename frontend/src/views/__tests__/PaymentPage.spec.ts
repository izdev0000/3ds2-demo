import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  PaymentIntentResult,
  Stripe,
  StripeCardCvcElement,
  StripeCardExpiryElement,
  StripeCardNumberElement,
  StripeElements,
} from '@stripe/stripe-js'
import PaymentPage from '@/views/PaymentPage.vue'
import * as stripeService from '@/services/stripe'
import * as paymentService from '@/services/payment'

const PAYMENT_LOCK_KEY = '3ds2-demo:payment-lock'

type ConfirmFn = Stripe['confirmCardPayment']
type NextActionFn = Stripe['handleNextAction']

interface FakeStripeSetup {
  stripe: Stripe
  confirmMock: ReturnType<typeof vi.fn<ConfirmFn>>
  nextActionMock: ReturnType<typeof vi.fn<NextActionFn>>
}

function makeFakeElement<T>(): T {
  return {
    mount: () => {},
    unmount: () => {},
  } as unknown as T
}

const succeededIntent = {
  paymentIntent: {
    id: 'pi_test',
    status: 'succeeded',
    client_secret: 'cs_test',
  },
} as unknown as PaymentIntentResult

function makeFakeStripe(opts: {
  confirm?: PaymentIntentResult
  next?: PaymentIntentResult | Promise<PaymentIntentResult>
} = {}): FakeStripeSetup {
  const cardNumber = makeFakeElement<StripeCardNumberElement>()
  const cardExpiry = makeFakeElement<StripeCardExpiryElement>()
  const cardCvc = makeFakeElement<StripeCardCvcElement>()

  const elements = {
    create: (type: string) => {
      if (type === 'cardNumber') return cardNumber
      if (type === 'cardExpiry') return cardExpiry
      if (type === 'cardCvc') return cardCvc
      throw new Error(`unexpected element type: ${type}`)
    },
  } as unknown as StripeElements

  const confirmMock = vi
    .fn<ConfirmFn>()
    .mockResolvedValue(opts.confirm ?? succeededIntent)
  const nextActionMock = vi.fn<NextActionFn>()
  if (opts.next instanceof Promise) {
    nextActionMock.mockReturnValue(opts.next)
  } else {
    nextActionMock.mockResolvedValue(opts.next ?? succeededIntent)
  }

  const stripe = {
    elements: vi.fn<() => StripeElements>(() => elements),
    confirmCardPayment: confirmMock,
    handleNextAction: nextActionMock,
  } as unknown as Stripe

  return { stripe, confirmMock, nextActionMock }
}

async function mountPage(stripe: Stripe): Promise<VueWrapper> {
  vi.spyOn(stripeService, 'getStripe').mockResolvedValue(stripe)
  const wrapper = mount(PaymentPage, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('PaymentPage 統合テスト', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.restoreAllMocks()
    vi.spyOn(paymentService, 'createPaymentIntent').mockResolvedValue({
      id: 'txn_test',
      client_secret: 'cs_test',
      status: 'requires_payment_method',
    })
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('mount 直後は PaymentForm 表示 + Stripe Elements が初期化される', async () => {
    const { stripe } = makeFakeStripe()
    const wrapper = await mountPage(stripe)

    expect(wrapper.text()).toContain('カード情報入力')
    expect(stripe.elements).toHaveBeenCalled()
  })

  it('frictionless: submit → succeeded → ResultView 表示', async () => {
    const { stripe, confirmMock, nextActionMock } = makeFakeStripe()
    const wrapper = await mountPage(stripe)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('✅ 成功')
    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(nextActionMock).not.toHaveBeenCalled()
  })

  it('challenge: requires_action → ChallengeView を経由して succeeded へ', async () => {
    let resolveNext: (v: PaymentIntentResult) => void = () => {}
    const nextPromise = new Promise<PaymentIntentResult>((r) => {
      resolveNext = r
    })
    const { stripe } = makeFakeStripe({
      confirm: {
        paymentIntent: {
          id: 'pi_test',
          status: 'requires_action',
          client_secret: 'cs_test',
        },
      } as unknown as PaymentIntentResult,
      next: nextPromise,
    })
    const wrapper = await mountPage(stripe)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // confirm は解決済み、handleNextAction は pending → ChallengeView 表示中
    expect(wrapper.text()).toContain('3DS2 チャレンジ実行中')
    expect(wrapper.text()).not.toContain('✅ 成功')

    resolveNext(succeededIntent)
    await flushPromises()

    expect(wrapper.text()).toContain('✅ 成功')
  })

  it('decline: confirm エラー → ResultView (失敗) にメッセージ表示', async () => {
    const { stripe } = makeFakeStripe({
      confirm: {
        error: { message: 'card declined' },
      } as unknown as PaymentIntentResult,
    })
    const wrapper = await mountPage(stripe)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('❌ 失敗')
    expect(wrapper.text()).toContain('card declined')
  })

  it('別 tab で lock 取得 → 警告バナー + submit ボタン disable', async () => {
    const { stripe } = makeFakeStripe()
    const wrapper = await mountPage(stripe)

    const submitBtn = wrapper.find('button[type="submit"]')
    expect(submitBtn.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('別 tab で決済処理中')

    localStorage.setItem(
      PAYMENT_LOCK_KEY,
      JSON.stringify({ tabId: 'other-tab-fixture', startedAt: Date.now() }),
    )
    window.dispatchEvent(
      new StorageEvent('storage', { key: PAYMENT_LOCK_KEY, newValue: 'x' }),
    )
    await flushPromises()

    expect(wrapper.text()).toContain('別 tab で決済処理中')
    expect(
      wrapper.find('button[type="submit"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('成功後に「最初に戻る」で PaymentForm に戻り、lock も解放される', async () => {
    const { stripe } = makeFakeStripe()
    const wrapper = await mountPage(stripe)

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('✅ 成功')
    expect(localStorage.getItem(PAYMENT_LOCK_KEY)).toBeNull()

    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('カード情報入力')
  })
})
