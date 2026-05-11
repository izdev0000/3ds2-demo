<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePaymentStore } from '@/stores/payment'

// 単一品目の仮注文を作る最小フォーム。複数行対応は別 PR で扱う。
const itemName = ref<string>('Demo item')
const itemQuantity = ref<number>(1)
const itemUnitPrice = ref<number>(100)
const currency = ref<string>('jpy')
const orderError = ref<string | null>(null)
const submitting = ref<boolean>(false)

const store = usePaymentStore()

const subtotal = computed(() => itemQuantity.value * itemUnitPrice.value)
const confirmed = computed(() => store.order !== null)

async function submitOrder() {
  if (confirmed.value) return
  orderError.value = null
  submitting.value = true
  try {
    await store.createOrder({
      currency: currency.value,
      items: [
        {
          name: itemName.value,
          quantity: itemQuantity.value,
          unit_price: itemUnitPrice.value,
        },
      ],
    })
  } catch (e) {
    orderError.value = e instanceof Error ? e.message : String(e)
  } finally {
    submitting.value = false
  }
}

function discard() {
  store.resetOrder()
  orderError.value = null
}
</script>

<template>
  <section class="order-form" :class="{ confirmed }">
    <header>
      <h2>① 注文</h2>
      <span v-if="confirmed" class="badge confirmed-badge">確定済</span>
    </header>

    <p v-if="orderError" class="error">注文作成失敗: {{ orderError }}</p>

    <!-- 入力モード: Order 未確定 -->
    <form
      v-if="!confirmed"
      class="fields"
      @submit.prevent="submitOrder"
    >
      <label>
        商品名
        <input v-model="itemName" type="text" required />
      </label>
      <div class="row">
        <label>
          数量
          <input v-model.number="itemQuantity" type="number" min="1" required />
        </label>
        <label>
          単価
          <input
            v-model.number="itemUnitPrice"
            type="number"
            min="0"
            required
          />
        </label>
        <label>
          通貨
          <input v-model="currency" type="text" maxlength="3" required />
        </label>
      </div>
      <p class="subtotal">
        合計: {{ subtotal }} {{ currency.toUpperCase() }}
        <span v-if="subtotal < 50" class="warn-inline">
          (Stripe の最小単位 50 未満)
        </span>
      </p>
      <button type="submit" :disabled="submitting || subtotal < 50">
        {{ submitting ? '送信中…' : '注文確定' }}
      </button>
    </form>

    <!-- 確定済モード: Order 情報を表示 + 破棄ボタン -->
    <div v-else class="summary">
      <dl>
        <dt>Order ID</dt>
        <dd><code>{{ store.order!.id }}</code></dd>
        <dt>明細</dt>
        <dd>
          <ul class="items">
            <li v-for="item in store.order!.items" :key="item.id">
              {{ item.name }} × {{ item.quantity }} ({{ item.subtotal }}
              {{ store.order!.currency.toUpperCase() }})
            </li>
          </ul>
        </dd>
        <dt>合計</dt>
        <dd>{{ store.order!.amount }} {{ store.order!.currency.toUpperCase() }}</dd>
        <dt>Status</dt>
        <dd><code>{{ store.order!.status }}</code></dd>
      </dl>
      <button type="button" class="discard" @click="discard">
        注文を破棄してやり直し
      </button>
    </div>
  </section>
</template>

<style scoped>
.order-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.order-form.confirmed {
  border-color: #2a8;
  background: rgba(42, 136, 80, 0.04);
}

header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

header h2 {
  margin: 0;
  font-size: 1.1rem;
}

.badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
}

.confirmed-badge {
  background: #2a8;
  color: white;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.row {
  display: flex;
  gap: 1rem;
}

.row label,
.fields > label {
  flex: 1;
  display: flex;
  flex-direction: column;
  font-size: 0.85rem;
  gap: 0.25rem;
}

input {
  padding: 0.4rem;
  font-size: 1rem;
}

.subtotal {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.85;
}

.warn-inline {
  color: #b58900;
  margin-left: 0.25rem;
}

.error {
  color: #c00;
  font-size: 0.85rem;
}

button {
  padding: 0.5rem 1rem;
  font-size: 0.95rem;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.discard {
  align-self: flex-start;
  background: transparent;
  border: 1px solid var(--color-border);
  color: inherit;
  font-size: 0.8rem;
  padding: 0.3rem 0.6rem;
}

.summary dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin: 0;
  font-size: 0.9rem;
}

.summary dt {
  font-weight: 600;
  opacity: 0.8;
}

.summary dd {
  margin: 0;
  word-break: break-all;
}

.items {
  margin: 0;
  padding-left: 1rem;
  list-style: disc;
}

code {
  font-family: monospace;
}
</style>
