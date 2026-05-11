// docs/api-contract.yaml の Order 関連スキーマを反映。
// 暫定インターフェース。将来 openapi-typescript 等で型自動生成する想定。

export type OrderStatus = 'pending' | 'paid' | 'canceled' | 'refunded'

export interface OrderItemInput {
  name: string
  quantity: number
  unit_price: number
}

export interface OrderItem extends OrderItemInput {
  id: string
  subtotal: number
}

export interface CreateOrderRequest {
  currency: string
  items: OrderItemInput[]
  metadata?: Record<string, unknown>
}

export interface OrderResponse {
  id: string
  status: OrderStatus
  amount: number
  currency: string
  items: OrderItem[]
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

const backendUrl = import.meta.env.VITE_BACKEND_ORIGIN

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!backendUrl) {
    throw new Error('VITE_BACKEND_ORIGIN が未設定です')
  }
  const res = await fetch(`${backendUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    throw new Error(`backend ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

export function createOrder(body: CreateOrderRequest): Promise<OrderResponse> {
  return request<OrderResponse>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function getOrder(id: string): Promise<OrderResponse> {
  return request<OrderResponse>(`/api/orders/${id}`)
}
