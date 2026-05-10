// 複数 tab 間の重複決済を防ぐための localStorage ベース mutex。
// sessionStorage は per-tab で別領域のため cross-tab には使えない。
// localStorage の `storage` イベントは「書き込んだ tab 以外」で発火するので、
// 他 tab の acquire / release を検知できる。
//
// crash 時の lock 残留対策として TTL を持たせる (5 分)。

const STORAGE_KEY = '3ds2-demo:payment-lock'
const TTL_MS = 5 * 60 * 1000

interface Lock {
  tabId: string
  startedAt: number
}

const tabId: string = crypto.randomUUID()

export function getTabId(): string {
  return tabId
}

function read(): Lock | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Lock
    if (typeof parsed.tabId !== 'string' || typeof parsed.startedAt !== 'number') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function isStale(lock: Lock): boolean {
  return Date.now() - lock.startedAt > TTL_MS
}

export function tryAcquire(): boolean {
  const current = read()
  if (current && current.tabId !== tabId && !isStale(current)) {
    return false
  }
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ tabId, startedAt: Date.now() } satisfies Lock),
  )
  return true
}

export function release(): void {
  const current = read()
  if (current && current.tabId === tabId) {
    localStorage.removeItem(STORAGE_KEY)
  }
}

export function isLockedByOther(): boolean {
  const current = read()
  return current !== null && current.tabId !== tabId && !isStale(current)
}

export function onChange(cb: () => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) cb()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
