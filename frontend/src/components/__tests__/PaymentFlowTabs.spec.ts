import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PaymentFlowTabs from '@/components/PaymentFlowTabs.vue'
import { usePaymentStore } from '@/stores/payment'

describe('PaymentFlowTabs', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('2 つのタブが表示される', () => {
    const wrapper = mount(PaymentFlowTabs)
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.text()).toContain('Inline')
    expect(buttons[1]?.text()).toContain('Redirect')
  })

  it('初期状態は client_sdk タブが active', () => {
    const wrapper = mount(PaymentFlowTabs)
    const buttons = wrapper.findAll('button')
    expect(buttons[0]?.classes()).toContain('active')
    expect(buttons[1]?.classes()).not.toContain('active')
  })

  it('Redirect タブ押下で currentFlow が server_redirect に切替、store.reset が呼ばれる', async () => {
    const store = usePaymentStore()
    const resetSpy = vi.spyOn(store, 'reset')
    const wrapper = mount(PaymentFlowTabs)

    await wrapper.findAll('button')[1]?.trigger('click')

    expect(store.currentFlow).toBe('server_redirect')
    expect(resetSpy).toHaveBeenCalledOnce()
    expect(wrapper.findAll('button')[1]?.classes()).toContain('active')
  })

  it('同じタブを再度押しても reset は呼ばれない', async () => {
    const store = usePaymentStore()
    const resetSpy = vi.spyOn(store, 'reset')
    const wrapper = mount(PaymentFlowTabs)

    // 既に active な client_sdk を押す
    await wrapper.findAll('button')[0]?.trigger('click')

    expect(resetSpy).not.toHaveBeenCalled()
  })
})
