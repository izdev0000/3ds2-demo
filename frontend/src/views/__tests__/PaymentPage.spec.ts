import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PaymentPage from '@/views/PaymentPage.vue'
import * as StripePspClientModule from '@/services/StripePspClient'
import * as paymentService from '@/services/payment'
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

  it('mount 直後は PaymentForm 表示 + PspClient.mountCardForm が呼ばれる', async () => {
    setupFakePsp()
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('カード情報入力')
    expect(
      StripePspClientModule.stripePspClient.mountCardForm,
    ).toHaveBeenCalled()
  })

  it('frictionless: submit → succeeded → ResultView 表示', async () => {
    const { confirmMock } = setupFakePsp()
    const wrapper = await mountPage()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
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

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // onChallenge は呼ばれ済み (phase = challenging)、confirm は pending
    expect(wrapper.text()).toContain('3DS2 チャレンジ実行中')
    expect(wrapper.text()).not.toContain('✅ 成功')

    resolveConfirm({ kind: 'succeeded', finalStatus: 'succeeded' })
    await flushPromises()
    expect(wrapper.text()).toContain('✅ 成功')
  })

  it('decline: PspClient が failed → ResultView (失敗) にメッセージ表示', async () => {
    setupFakePsp({ confirm: { kind: 'failed', message: 'card declined' } })
    const wrapper = await mountPage()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('❌ 失敗')
    expect(wrapper.text()).toContain('card declined')
  })

  it('別 tab で lock 取得 → 警告バナー + submit ボタン disable', async () => {
    setupFakePsp()
    const wrapper = await mountPage()

    expect(
      wrapper.find('button[type="submit"]').attributes('disabled'),
    ).toBeUndefined()
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
    setupFakePsp()
    const wrapper = await mountPage()

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('✅ 成功')
    expect(localStorage.getItem(PAYMENT_LOCK_KEY)).toBeNull()

    const resetButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('最初に戻る'))
    expect(resetButton).toBeTruthy()
    await resetButton?.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('カード情報入力')
  })
})
