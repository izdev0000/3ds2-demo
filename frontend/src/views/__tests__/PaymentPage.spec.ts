import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PaymentPage from '@/views/PaymentPage.vue'
import * as StripePspClientModule from '@/services/StripePspClient'
import * as paymentService from '@/services/payment'
import * as orderService from '@/services/order'
import type { ConfirmResult } from '@/services/PspClient'

const PAYMENT_LOCK_KEY = '3ds2-demo:payment-lock'

interface FakePspSetup {
  confirmMock: ReturnType<typeof vi.fn>
  unmountMock: ReturnType<typeof vi.fn>
}

function setupFakePsp(opts: {
  confirm?: ConfirmResult | Promise<ConfirmResult>
  triggerChallenge?: boolean
} = {}): FakePspSetup {
  const psp = StripePspClientModule.stripePspClient
  vi.spyOn(psp, 'init').mockResolvedValue()
  const unmountMock = vi.fn<() => void>()
  vi.spyOn(psp, 'mountCardForm').mockResolvedValue({
    card: {},
    unmount: unmountMock,
  })
  vi.spyOn(psp, 'createPaymentMethod').mockResolvedValue({
    paymentMethodId: 'pm_test_from_card',
  })
  const confirmMock = vi
    .fn<typeof psp.confirmAndChallenge>()
    .mockImplementation(async ({ onChallenge }) => {
      if (opts.triggerChallenge) onChallenge?.()
      if (opts.confirm instanceof Promise) {
        return opts.confirm
      }
      return opts.confirm ?? { kind: 'succeeded', finalStatus: 'succeeded' }
    })
  vi.spyOn(psp, 'confirmAndChallenge').mockImplementation(confirmMock)
  return { confirmMock, unmountMock }
}

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(PaymentPage, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

// 2 ステップ UX (① カート追加 → ② 支払う) を 1 回で進める helper。
// OrderForm は確定後も <form> (disabled inputs + 破棄ボタン) を保持するため、
// form の index は常に [0]=OrderForm, [1]=PaymentCardSection で安定する。
async function submitFullFlow(wrapper: VueWrapper) {
  await wrapper.findAll('form')[0]!.trigger('submit')
  await flushPromises()
  await wrapper.findAll('form')[1]!.trigger('submit')
  await flushPromises()
}

describe('PaymentPage 統合テスト', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.restoreAllMocks()
    vi.spyOn(paymentService, 'createPaymentIntent').mockResolvedValue({
      id: 'txn_test',
      order_id: 'ord_test',
      client_secret: 'cs_test',
      status: 'requires_payment_method',
    })
    // フォーム送信は POST /api/orders を先に叩くため、Order 作成も mock する。
    vi.spyOn(orderService, 'createOrder').mockResolvedValue({
      id: 'ord_test',
      status: 'pending',
      amount: 100,
      currency: 'jpy',
      items: [
        {
          id: 'oit_test',
          name: 'Demo item',
          quantity: 1,
          unit_price: 100,
          subtotal: 100,
        },
      ],
      metadata: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('mount 直後は OrderForm + PaymentCardSection 表示 + PspClient.mountCardForm が呼ばれる', async () => {
    setupFakePsp()
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('① カート')
    expect(wrapper.text()).toContain('② 決済')
    expect(
      StripePspClientModule.stripePspClient.mountCardForm,
    ).toHaveBeenCalled()
  })

  it('frictionless: submit → succeeded → ResultView 表示', async () => {
    const { confirmMock } = setupFakePsp()
    const wrapper = await mountPage()
    await submitFullFlow(wrapper)
    expect(wrapper.text()).toContain('✅ 成功')
    expect(confirmMock).toHaveBeenCalledTimes(1)
  })

  it('challenge: onChallenge 通知中に ChallengeView を表示し、最終 succeeded', async () => {
    let resolveConfirm: (v: ConfirmResult) => void = () => {}
    const pending = new Promise<ConfirmResult>((r) => {
      resolveConfirm = r
    })
    setupFakePsp({ triggerChallenge: true, confirm: pending })
    const wrapper = await mountPage()

    await submitFullFlow(wrapper)

    // onChallenge は呼ばれ済み (phase = challenging)、confirm は pending
    expect(wrapper.text()).toContain('3DS2 チャレンジ実行中')
    expect(wrapper.text()).not.toContain('✅ 成功')

    resolveConfirm({ kind: 'succeeded', finalStatus: 'succeeded' })
    await flushPromises()
    expect(wrapper.text()).toContain('✅ 成功')
  })

  it('decline: PspClient が failed → 決済セクションにエラーメッセージ表示 + 同 Order で再決済可能', async () => {
    setupFakePsp({ confirm: { kind: 'failed', message: 'card declined' } })
    const wrapper = await mountPage()
    await submitFullFlow(wrapper)
    expect(wrapper.text()).toContain('決済失敗')
    expect(wrapper.text()).toContain('card declined')
    // 失敗後も OrderForm 確定済 + PaymentCardSection は残る (1 Order : N Transaction)
    expect(wrapper.text()).toContain('① カート')
    expect(wrapper.text()).toContain('② 決済')
  })

  it('別 tab で lock 取得 → 決済セクションに警告バナー + 「支払う」ボタン disable', async () => {
    setupFakePsp()
    const wrapper = await mountPage()

    // Step 1: カート追加して PaymentCardSection を active にする。
    // OrderForm は確定後も form を保持するので、card form は常に forms[1]。
    await wrapper.findAll('form')[0]!.trigger('submit')
    await flushPromises()

    // カート追加直後は lock なし → 「支払う」 enabled
    const payButton = () =>
      wrapper.findAll('form')[1]!.find('button[type="submit"]')
    expect(payButton().attributes('disabled')).toBeUndefined()
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
    expect(payButton().attributes('disabled')).toBeDefined()
  })

  it('idle 中は busy overlay 非表示', async () => {
    setupFakePsp()
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="busy-overlay"]').exists()).toBe(false)
  })

  it('challenging 中は busy overlay が表示され、メッセージは「3DS2 認証中…」', async () => {
    let resolveNext: (v: ConfirmResult) => void = () => {}
    const pending = new Promise<ConfirmResult>((r) => {
      resolveNext = r
    })
    setupFakePsp({ triggerChallenge: true, confirm: pending })
    const wrapper = await mountPage()

    await submitFullFlow(wrapper)

    const overlay = wrapper.find('[data-testid="busy-overlay"]')
    expect(overlay.exists()).toBe(true)
    expect(overlay.text()).toContain('3DS2 認証中')

    // resolve して succeeded まで進めると overlay が消える
    resolveNext({ kind: 'succeeded', finalStatus: 'succeeded' })
    await flushPromises()
    expect(wrapper.find('[data-testid="busy-overlay"]').exists()).toBe(false)
  })

  it('成功後に「最初に戻る」で PaymentForm に戻り、lock も解放される', async () => {
    setupFakePsp()
    const wrapper = await mountPage()

    await submitFullFlow(wrapper)
    expect(wrapper.text()).toContain('✅ 成功')
    expect(localStorage.getItem(PAYMENT_LOCK_KEY)).toBeNull()

    const resetButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('最初に戻る'))
    expect(resetButton).toBeTruthy()
    await resetButton?.trigger('click')
    await flushPromises()
    // 「最初に戻る」で OrderForm 入力モードに戻る (Order も破棄される)
    expect(wrapper.text()).toContain('① カート')
    expect(wrapper.text()).toContain('② 決済')
  })
})
