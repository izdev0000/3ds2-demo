// TODO(Phase 3): docs/api-contract.yaml 確定後に OpenAPI 生成型へ差し替え

export interface CreatePaymentIntentRequest {
  amount: number
  currency: string
}

export interface PaymentIntentResponse {
  id: string
  clientSecret: string
  status: string
}

const backendUrl = import.meta.env.VITE_BACKEND_URL

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${backendUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
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

export function confirmPaymentIntent(id: string): Promise<PaymentIntentResponse> {
  return request<PaymentIntentResponse>(`/api/payments/${id}/confirm`, {
    method: 'POST',
  })
}
