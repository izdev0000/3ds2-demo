// docs/api-contract.yaml で確定予定の暫定インターフェース。
// backend (StripeAdapter) は PaymentIntent を作成し、client_secret を返す。
// フロント側で stripe.confirmCardPayment / handleNextAction を明示的に呼ぶ。

export type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded'

export interface CreatePaymentIntentRequest {
  amount: number
  currency: string
}

export interface PaymentIntentResponse {
  id: string
  clientSecret: string
  status: PaymentIntentStatus
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

export function createPaymentIntent(
  body: CreatePaymentIntentRequest,
): Promise<PaymentIntentResponse> {
  return request<PaymentIntentResponse>('/api/payments', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// challenge 完了後 / webhook 反映後の最新 status 取得用。
export function getPaymentIntent(id: string): Promise<PaymentIntentResponse> {
  return request<PaymentIntentResponse>(`/api/payments/${id}`)
}
