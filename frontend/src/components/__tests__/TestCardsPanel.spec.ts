import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TestCardsPanel from '@/components/TestCardsPanel.vue'
import * as StripePspClientModule from '@/services/StripePspClient'
import { usePaymentStore } from '@/stores/payment'

describe('TestCardsPanel', () => {
  let writeText: ReturnType<typeof vi.fn<(s: string) => Promise<void>>>

  beforeEach(() => {
    setActivePinia(createPinia())
    writeText = vi.fn<(s: string) => Promise<void>>().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('5 件のテストカードがすべて表示される', () => {
    const wrapper = mount(TestCardsPanel)
    expect(wrapper.findAll('li')).toHaveLength(5)
    expect(wrapper.text()).toContain('4242 4242 4242 4242')
    expect(wrapper.text()).toContain('4000 0084 0000 1629')
    expect(wrapper.text()).toContain('4000 0027 6000 3184')
    expect(wrapper.text()).toContain('4000 0082 6000 3178')
    expect(wrapper.text()).toContain('4000 0000 0000 0002')
  })

  it('「コピー」押下で navigator.clipboard.writeText に空白除去された値が渡る', async () => {
    const wrapper = mount(TestCardsPanel)
    // 1 つ目の li の copy ボタン (.primary 以外) を取得
    const copyButton = wrapper.find('li').find('button:not(.primary)')
    await copyButton.trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('4242424242424242')
  })

  it('コピー後、ボタン文言が「コピー済」に変わる', async () => {
    const wrapper = mount(TestCardsPanel)
    const copyButton = wrapper.find('li').find('button:not(.primary)')
    expect(copyButton.text()).toBe('コピー')
    await copyButton.trigger('click')
    await flushPromises()
    expect(copyButton.text()).toBe('コピー済')
  })

  it('コピー後 2 秒で文言が「コピー」に戻る', async () => {
    vi.useFakeTimers()
    const wrapper = mount(TestCardsPanel)
    const copyButton = wrapper.find('li').find('button:not(.primary)')
    await copyButton.trigger('click')
    await flushPromises()
    expect(copyButton.text()).toBe('コピー済')
    vi.advanceTimersByTime(2000)
    await flushPromises()
    expect(copyButton.text()).toBe('コピー')
  })

  it('「実行」押下で store.start が paymentMethodId 付きで呼ばれる', async () => {
    const store = usePaymentStore()
    const startSpy = vi
      .spyOn(store, 'start')
      .mockResolvedValue(undefined as unknown as void)

    const wrapper = mount(TestCardsPanel)
    const executeButton = wrapper.find('li').find('button.primary')
    await executeButton.trigger('click')

    expect(startSpy).toHaveBeenCalledWith({
      amount: 100,
      currency: 'jpy',
      psp: StripePspClientModule.stripePspClient,
      paymentMethodId: 'pm_card_visa',
    })
  })

  it('全 5 card が alias を持つので「実行」ボタンが 5 個 ある', () => {
    const wrapper = mount(TestCardsPanel)
    expect(wrapper.findAll('button.primary')).toHaveLength(5)
  })
})
