<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  Stripe,
  StripeCardElement,
  StripeElements,
} from '@stripe/stripe-js'
import { getStripe } from '@/services/stripe'
import { usePaymentStore } from '@/stores/payment'

const cardMount = ref<HTMLDivElement | null>(null)
const amount = ref<number>(100)
const currency = ref<string>('jpy')
const mountError = ref<string | null>(null)
const isMounted = ref<boolean>(false)

const store = usePaymentStore()

let stripe: Stripe | null = null
let elements: StripeElements | null = null
let card: StripeCardElement | null = null

onMounted(async () => {
  try {
    stripe = await getStripe()
  } catch (e) {
    mountError.value = e instanceof Error ? e.message : String(e)
    return
  }
  if (!stripe || !cardMount.value) {
    mountError.value = 'Stripe.js の初期化に失敗しました'
    return
  }
  elements = stripe.elements()
  card = elements.create('card')
  card.mount(cardMount.value)
  isMounted.value = true
})

onBeforeUnmount(() => {
  card?.unmount()
})

async function submit() {
  if (!stripe || !card) {
    mountError.value = 'Card Element が未準備です'
    return
  }
  await store.start({
    amount: amount.value,
    currency: currency.value,
    stripe,
    card,
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
      カード番号 / 有効期限 / CVC
      <div ref="cardMount" class="card-element"></div>
    </label>

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
