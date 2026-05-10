import { loadStripe, type Stripe } from '@stripe/stripe-js'

let stripePromise: Promise<Stripe | null> | null = null

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
    if (!publishableKey) {
      throw new Error('VITE_STRIPE_PUBLISHABLE_KEY が未設定です')
    }
    stripePromise = loadStripe(publishableKey)
  }
  return stripePromise
}
