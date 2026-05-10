import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CardHandle, ConfirmResult, PspClient } from '@/services/PspClient'
import { usePaymentStore } from '@/stores/payment'
import * as paymentService from '@/services/payment'
import { navigation } from '@/services/navigation'

const card: CardHandle = {}
const PAYMENT_LOCK_KEY = '3ds2-demo:payment-lock'

interface FakePspOptions {
  // confirmAndChallenge が返す結果
  confirm?: ConfirmResult
  // 内部で onChallenge を呼ぶか (challenge 経路の検証用)
  triggerChallenge?: boolean
}

function makeFakePsp(opts: FakePspOptions = {}): PspClient {
  return {
    init: vi.fn<() => Promise<void>>().mockResolvedValue(),
    mountCardForm: vi
      .fn<PspClient['mountCardForm']>()
      .mockResolvedValue({ card: {}, unmount: () => {} }),
    confirmAndChallenge: vi
      .fn<PspClient['confirmAndChallenge']>()
      .mockImplementation(async ({ onChallenge }) => {
        if (opts.triggerChallenge) onChallenge?.()
        return opts.confirm ?? { kind: 'succeeded', finalStatus: 'succeeded' }
      }),
    createPaymentMethod: vi
      .fn<PspClient['createPaymentMethod']>()
      .mockResolvedValue({ paymentMethodId: 'pm_test_from_card' }),
  }
}

describe('payment store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.restoreAllMocks()
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

  it('frictionless: PspClient が succeeded を返したら phase = succeeded', async () => {
    const store = usePaymentStore()
    const psp = makeFakePsp()
    await store.start({ amount: 100, currency: 'jpy', psp, card })
    expect(store.phase).toBe('succeeded')
    expect(store.finalStatus).toBe('succeeded')
  })

  it('challenge: onChallenge 通知 → phase = challenging を経て succeeded', async () => {
    const store = usePaymentStore()
    const psp = makeFakePsp({ triggerChallenge: true })
    await store.start({ amount: 100, currency: 'jpy', psp, card })
    expect(store.phase).toBe('succeeded')
  })

  it('PspClient が failed を返したら phase = failed', async () => {
    const store = usePaymentStore()
    const psp = makeFakePsp({
      confirm: { kind: 'failed', message: 'card declined' },
    })
    await store.start({ amount: 100, currency: 'jpy', psp, card })
    expect(store.phase).toBe('failed')
    expect(store.errorMessage).toBe('card declined')
  })

  it('backend エラー (createPaymentIntent throw) → phase = failed', async () => {
    vi.spyOn(paymentService, 'createPaymentIntent').mockRejectedValue(
      new Error('500 backend down'),
    )
    const store = usePaymentStore()
    const psp = makeFakePsp()
    await store.start({ amount: 100, currency: 'jpy', psp, card })
    expect(store.phase).toBe('failed')
    expect(store.errorMessage).toBe('500 backend down')
    expect(psp.confirmAndChallenge).not.toHaveBeenCalled()
  })

  it('別 tab で in-flight (lock 保持中) → 即 failed、PSP / API は呼ばれない', async () => {
    localStorage.setItem(
      PAYMENT_LOCK_KEY,
      JSON.stringify({ tabId: 'other-tab-fixture', startedAt: Date.now() }),
    )
    const store = usePaymentStore()
    const psp = makeFakePsp()
    await store.start({ amount: 100, currency: 'jpy', psp, card })
    expect(store.phase).toBe('failed')
    expect(store.errorMessage).toMatch(/別 tab/)
    expect(paymentService.createPaymentIntent).not.toHaveBeenCalled()
    expect(psp.confirmAndChallenge).not.toHaveBeenCalled()
  })

  it('成功後は lock が解放される (次の決済を block しない)', async () => {
    const store = usePaymentStore()
    const psp = makeFakePsp()
    await store.start({ amount: 100, currency: 'jpy', psp, card })
    expect(localStorage.getItem(PAYMENT_LOCK_KEY)).toBeNull()
  })

  it('paymentMethodId 経由で start すると PspClient に paymentMethodId が渡る', async () => {
    const store = usePaymentStore()
    const psp = makeFakePsp()
    await store.start({
      amount: 100,
      currency: 'jpy',
      psp,
      paymentMethodId: 'pm_card_visa',
    })
    expect(psp.confirmAndChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethodId: 'pm_card_visa' }),
    )
    expect(store.phase).toBe('succeeded')
  })

  describe('server_redirect flow', () => {
    const RETURN_URL = 'http://localhost:5173/payments/return'

    beforeEach(() => {
      sessionStorage.clear()
    })

    it('card 経由: createPaymentMethod → confirmPayment → next_action.redirect で navigation.redirect 発火', async () => {
      const store = usePaymentStore()
      const psp = makeFakePsp()
      const confirmSpy = vi
        .spyOn(paymentService, 'confirmPayment')
        .mockResolvedValue({
          id: 'pi_test',
          client_secret: 'cs_test',
          status: 'requires_action',
          amount: 100,
          currency: 'jpy',
          next_action: {
            type: 'redirect_to_url',
            redirect_to_url: { url: 'https://issuer.example/auth' },
          },
        })
      const redirectSpy = vi
        .spyOn(navigation, 'redirect')
        .mockImplementation(() => {})

      await store.start({
        amount: 100,
        currency: 'jpy',
        psp,
        card,
        flow: 'server_redirect',
        returnUrl: RETURN_URL,
      })

      expect(psp.createPaymentMethod).toHaveBeenCalled()
      expect(confirmSpy).toHaveBeenCalledWith(
        'pi_test',
        expect.objectContaining({
          payment_method_id: 'pm_test_from_card',
          flow: 'server_redirect',
          return_url: expect.stringContaining('txn=pi_test'),
        }),
      )
      expect(redirectSpy).toHaveBeenCalledWith('https://issuer.example/auth')
      expect(store.phase).toBe('redirecting')
      expect(sessionStorage.getItem('redirect-txn-id')).toBe('pi_test')
    })

    it('paymentMethodId 経由: createPaymentMethod は呼ばれず confirmPayment に直接 alias を渡す', async () => {
      const store = usePaymentStore()
      const psp = makeFakePsp()
      vi.spyOn(paymentService, 'confirmPayment').mockResolvedValue({
        id: 'pi_test',
        client_secret: 'cs_test',
        status: 'succeeded',
        amount: 100,
        currency: 'jpy',
        next_action: null,
      })
      vi.spyOn(navigation, 'redirect').mockImplementation(() => {})

      await store.start({
        amount: 100,
        currency: 'jpy',
        psp,
        paymentMethodId: 'pm_card_visa',
        flow: 'server_redirect',
        returnUrl: RETURN_URL,
      })

      expect(psp.createPaymentMethod).not.toHaveBeenCalled()
      expect(paymentService.confirmPayment).toHaveBeenCalledWith(
        'pi_test',
        expect.objectContaining({ payment_method_id: 'pm_card_visa' }),
      )
    })

    it('frictionless (next_action なし、status=succeeded) → phase = succeeded、redirect しない', async () => {
      const store = usePaymentStore()
      const psp = makeFakePsp()
      vi.spyOn(paymentService, 'confirmPayment').mockResolvedValue({
        id: 'pi_test',
        client_secret: 'cs_test',
        status: 'succeeded',
        amount: 100,
        currency: 'jpy',
        next_action: null,
      })
      const redirectSpy = vi
        .spyOn(navigation, 'redirect')
        .mockImplementation(() => {})

      await store.start({
        amount: 100,
        currency: 'jpy',
        psp,
        paymentMethodId: 'pm_card_visa',
        flow: 'server_redirect',
        returnUrl: RETURN_URL,
      })

      expect(redirectSpy).not.toHaveBeenCalled()
      expect(store.phase).toBe('succeeded')
      expect(store.finalStatus).toBe('succeeded')
    })

    it('returnUrl 未指定 → 即 failed、createPaymentIntent は呼ばれているが confirmPayment は呼ばれない', async () => {
      const store = usePaymentStore()
      const psp = makeFakePsp()
      const confirmSpy = vi
        .spyOn(paymentService, 'confirmPayment')
        .mockResolvedValue({} as never)

      await store.start({
        amount: 100,
        currency: 'jpy',
        psp,
        paymentMethodId: 'pm_card_visa',
        flow: 'server_redirect',
      })

      expect(store.phase).toBe('failed')
      expect(store.errorMessage).toMatch(/returnUrl/)
      expect(confirmSpy).not.toHaveBeenCalled()
    })

    it('confirmPayment が throw → phase = failed', async () => {
      const store = usePaymentStore()
      const psp = makeFakePsp()
      vi.spyOn(paymentService, 'confirmPayment').mockRejectedValue(
        new Error('500 backend down'),
      )

      await store.start({
        amount: 100,
        currency: 'jpy',
        psp,
        paymentMethodId: 'pm_card_visa',
        flow: 'server_redirect',
        returnUrl: RETURN_URL,
      })

      expect(store.phase).toBe('failed')
      expect(store.errorMessage).toBe('500 backend down')
    })

    it('store.currentFlow にデフォルトを依存 (flow 引数省略)', async () => {
      const store = usePaymentStore()
      store.currentFlow = 'server_redirect'
      const psp = makeFakePsp()
      vi.spyOn(paymentService, 'confirmPayment').mockResolvedValue({
        id: 'pi_test',
        client_secret: 'cs_test',
        status: 'succeeded',
        amount: 100,
        currency: 'jpy',
        next_action: null,
      })

      await store.start({
        amount: 100,
        currency: 'jpy',
        psp,
        paymentMethodId: 'pm_card_visa',
        returnUrl: RETURN_URL,
      })

      expect(paymentService.confirmPayment).toHaveBeenCalled()
      expect(psp.confirmAndChallenge).not.toHaveBeenCalled()
    })
  })
})
