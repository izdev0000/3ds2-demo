import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getTabId,
  isLockedByOther,
  onChange,
  release,
  tryAcquire,
} from '@/services/paymentLock'

const STORAGE_KEY = '3ds2-demo:payment-lock'

function writeOtherTabLock(opts: { ageMs?: number } = {}) {
  const startedAt = Date.now() - (opts.ageMs ?? 0)
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ tabId: 'other-tab-fixture', startedAt }),
  )
}

describe('paymentLock', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('未取得状態で tryAcquire は true を返し、自 tab の lock を書き込む', () => {
    expect(tryAcquire()).toBe(true)
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toMatchObject({ tabId: getTabId() })
  })

  it('release で自 tab の lock を解除できる', () => {
    tryAcquire()
    release()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('別 tab の有効な lock 中は tryAcquire が false', () => {
    writeOtherTabLock()
    expect(tryAcquire()).toBe(false)
  })

  it('別 tab の stale (TTL 超過) lock は override できる', () => {
    writeOtherTabLock({ ageMs: 6 * 60 * 1000 })
    expect(tryAcquire()).toBe(true)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
      tabId: getTabId(),
    })
  })

  it('release は他 tab が保持中の lock を奪わない', () => {
    writeOtherTabLock()
    release()
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('isLockedByOther は別 tab 有効 lock 時のみ true', () => {
    expect(isLockedByOther()).toBe(false)

    writeOtherTabLock()
    expect(isLockedByOther()).toBe(true)

    localStorage.clear()
    tryAcquire()
    expect(isLockedByOther()).toBe(false)
  })

  it('onChange は storage event (key 一致) で発火、unsubscribe で停止', () => {
    const cb = vi.fn<() => void>()
    const unsub = onChange(cb)

    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'x' }),
    )
    expect(cb).toHaveBeenCalledTimes(1)

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'unrelated', newValue: 'x' }),
    )
    expect(cb).toHaveBeenCalledTimes(1)

    unsub()
    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'y' }),
    )
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
