// 学習デモ用 debug endpoint クライアント。
// docs/api-contract.yaml の getDebugRecentRows と整合。

export interface DebugOrderRow {
  id: string
  status: string
  amount: number
  currency: string
  created_at: string | null
  updated_at: string | null
}

export interface DebugTransactionRow {
  id: string
  order_id: string
  status: string
  psp_payment_intent_id: string | null
  amount: number
  currency: string
  created_at: string | null
  updated_at: string | null
}

export interface DebugOrderItemRow {
  id: string
  order_id: string
  name: string
  quantity: number
  unit_price: number
  created_at: string | null
}

export interface DebugWebhookEventRow {
  id: string
  psp: string
  psp_event_id: string
  event_type: string
  transaction_id: string | null
  received_at: string | null
  processed_at: string | null
}

export interface DebugRecentRows {
  orders: DebugOrderRow[]
  transactions: DebugTransactionRow[]
  order_items: DebugOrderItemRow[]
  webhook_events: DebugWebhookEventRow[]
}

const backendUrl = import.meta.env.VITE_BACKEND_ORIGIN

export async function fetchRecentRows(): Promise<DebugRecentRows> {
  if (!backendUrl) {
    throw new Error('VITE_BACKEND_ORIGIN が未設定です')
  }
  const res = await fetch(`${backendUrl}/api/_debug/recent-rows`)
  if (!res.ok) {
    throw new Error(`backend ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<DebugRecentRows>
}
