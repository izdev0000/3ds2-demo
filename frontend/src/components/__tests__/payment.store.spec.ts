import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePaymentStore } from '@/stores/payment'

describe('payment store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
})
