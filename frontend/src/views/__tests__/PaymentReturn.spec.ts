import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import PaymentReturn from '@/views/PaymentReturn.vue'
import * as paymentService from '@/services/payment'

const REDIRECT_TXN_KEY = 'redirect-txn-id'

async function mountWithRoute(path: string) {
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/payments/return', component: PaymentReturn },
    ],
  })
  router.push(path)
  await router.isReady()

  const wrapper = mount(PaymentReturn, {
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

describe('PaymentReturn', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('?txn=xxx から ID を取得し getPaymentIntent を呼んで結果を表示', async () => {
    const getSpy = vi
      .spyOn(paymentService, 'getPaymentIntent')
      .mockResolvedValue({
        id: 'pi_test',
        client_secret: 'cs_test',
        status: 'succeeded',
        amount: 100,
        currency: 'jpy',
        next_action: null,
      })

    const wrapper = await mountWithRoute('/payments/return?txn=pi_test')

    expect(getSpy).toHaveBeenCalledWith('pi_test')
    expect(wrapper.text()).toContain('成功')
    expect(wrapper.text()).toContain('pi_test')
    expect(wrapper.text()).toContain('JPY')
  })

  it('?txn 無し → sessionStorage の fallback を使う', async () => {
    sessionStorage.setItem(REDIRECT_TXN_KEY, 'pi_fallback')
    const getSpy = vi
      .spyOn(paymentService, 'getPaymentIntent')
      .mockResolvedValue({
        id: 'pi_fallback',
        client_secret: 'cs',
        status: 'succeeded',
        amount: 200,
        currency: 'usd',
        next_action: null,
      })

    const wrapper = await mountWithRoute('/payments/return')

    expect(getSpy).toHaveBeenCalledWith('pi_fallback')
    expect(wrapper.text()).toContain('pi_fallback')
    // 取得後 sessionStorage はクリアされる
    expect(sessionStorage.getItem(REDIRECT_TXN_KEY)).toBeNull()
  })

  it('ID が取得できない → エラー表示', async () => {
    const wrapper = await mountWithRoute('/payments/return')
    expect(wrapper.text()).toMatch(/transaction ID/)
  })

  it('getPaymentIntent が throw → エラー表示', async () => {
    vi.spyOn(paymentService, 'getPaymentIntent').mockRejectedValue(
      new Error('404 not found'),
    )
    const wrapper = await mountWithRoute('/payments/return?txn=pi_unknown')
    expect(wrapper.text()).toContain('404 not found')
  })
})
