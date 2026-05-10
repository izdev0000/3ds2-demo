<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  Stripe,
  StripeCardCvcElement,
  StripeCardExpiryElement,
  StripeCardNumberElement,
  StripeElements,
} from '@stripe/stripe-js'
import { getStripe } from '@/services/stripe'
import { usePaymentStore } from '@/stores/payment'

const numberMount = ref<HTMLDivElement | null>(null)
const expiryMount = ref<HTMLDivElement | null>(null)
const cvcMount = ref<HTMLDivElement | null>(null)
const amount = ref<number>(100)
const currency = ref<string>('jpy')
const mountError = ref<string | null>(null)
const isMounted = ref<boolean>(false)

const store = usePaymentStore()

let stripe: Stripe | null = null
let elements: StripeElements | null = null
let cardNumber: StripeCardNumberElement | null = null
let cardExpiry: StripeCardExpiryElement | null = null
let cardCvc: StripeCardCvcElement | null = null

onMounted(async () => {
  try {
    stripe = await getStripe()
  } catch (e) {
    mountError.value = e instanceof Error ? e.message : String(e)
    return
  }
  if (!stripe || !numberMount.value || !expiryMount.value || !cvcMount.value) {
    mountError.value = 'Stripe.js の初期化に失敗しました'
    return
  }
  elements = stripe.elements()
  cardNumber = elements.create('cardNumber', {
    placeholder: '4100 0000 0000 0100',
  })
  cardExpiry = elements.create('cardExpiry', {
    placeholder: '12 / 40',
  })
  cardCvc = elements.create('cardCvc', {
    placeholder: '123',
  })
  cardNumber.mount(numberMount.value)
  cardExpiry.mount(expiryMount.value)
  cardCvc.mount(cvcMount.value)
  isMounted.value = true
})

onBeforeUnmount(() => {
  cardNumber?.unmount()
  cardExpiry?.unmount()
  cardCvc?.unmount()
})

async function submit() {
  if (!stripe || !cardNumber) {
    mountError.value = 'Card Element が未準備です'
    return
  }
  // confirmCardPayment は同一 Elements インスタンスの cardExpiry / cardCvc を自動連携。
  await store.start({
    amount: amount.value,
    currency: currency.value,
    stripe,
    card: cardNumber,
  })
}
</script>

<template>
  <form class="payment-form" @submit.prevent="submit">
    <h2>カード情報入力</h2>

    <p v-if="mountError" class="error">{{ mountError }}</p>

    <div class="row">
      <label>
        金額
        <input v-model.number="amount" type="number" min="50" required />
      </label>
      <label>
        通貨
        <input v-model="currency" type="text" maxlength="3" required />
      </label>
    </div>

    <label class="card-label">
      カード番号
      <div ref="numberMount" class="card-element"></div>
    </label>

    <div class="row">
      <label class="card-label">
        有効期限
        <div ref="expiryMount" class="card-element"></div>
      </label>
      <label class="card-label">
        CVC
        <div ref="cvcMount" class="card-element"></div>
      </label>
    </div>

    <button
      type="submit"
      :disabled="!isMounted || store.phase === 'preparing'"
    >
      {{ store.phase === 'preparing' ? '送信中…' : '支払う' }}
    </button>
  </form>
</template>

<style scoped>
.payment-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.row {
  display: flex;
  gap: 1rem;
}

.row label {
  flex: 1;
  display: flex;
  flex-direction: column;
  font-size: 0.85rem;
}

.row input {
  width: 100%;
  padding: 0.4rem;
  font-size: 1rem;
}

.card-label {
  display: flex;
  flex-direction: column;
  font-size: 0.85rem;
  gap: 0.25rem;
}

.card-element {
  padding: 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background-soft);
}

.error {
  color: #c00;
  font-size: 0.85rem;
}

button {
  padding: 0.6rem 1rem;
  font-size: 1rem;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
