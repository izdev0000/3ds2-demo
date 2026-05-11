// docs/api-contract.yaml の PaymentResponse / ConfirmPaymentRequest を反映する
// 暫定インターフェース。将来 openapi-typescript 等で型自動生成する想定。

import { useScenarioStore } from '@/stores/scenario'

export type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded'

export type ConfirmationFlow = 'client_sdk' | 'server_redirect'

export interface CreatePaymentIntentRequest {
  order_id: string
  return_url?: string
}

export interface NextAction {
  type: 'use_stripe_sdk' | 'redirect_to_url'
  redirect_to_url?: {
    url: string
    return_url?: string
  }
}

// Backward-compat alias: 既存呼出が使う minimal subset 型
export interface PaymentIntentResponse {
  id: string
  order_id: string
  client_secret: string
  status: PaymentIntentStatus
}

// docs/api-contract.yaml の PaymentResponse 全フィールド
export interface PaymentResponse extends PaymentIntentResponse {
  amount: number
  currency: string
  next_action?: NextAction | null
}

export interface ConfirmPaymentRequest {
  payment_method_id: string
  return_url?: string
  flow: ConfirmationFlow
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
  const scenario = useScenarioStore()
  if (scenario.current === 'payments_500') {
    return Promise.reject(
      new Error('Simulated: 500 Internal Server Error (POST /api/payments)'),
    )
  }
  return request<PaymentIntentResponse>('/api/payments', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// challenge 完了後 / webhook 反映後の最新 status 取得用。
export function getPaymentIntent(id: string): Promise<PaymentResponse> {
  return request<PaymentResponse>(`/api/payments/${id}`)
}

// server_redirect flow で backend が confirm + redirect URL を返す。
// client_sdk flow でも一応呼べるが、現状 frontend は使わない。
export function confirmPayment(
  id: string,
  body: ConfirmPaymentRequest,
): Promise<PaymentResponse> {
  return request<PaymentResponse>(`/api/payments/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
