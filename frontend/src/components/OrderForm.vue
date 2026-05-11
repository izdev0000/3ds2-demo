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
      <h2>① カート</h2>
      <span v-if="confirmed" class="badge confirmed-badge">カートイン済</span>
    </header>

    <p v-if="orderError" class="error">カートイン失敗: {{ orderError }}</p>

    <!-- 確定の前後でレイアウトを変えず、フィールドは disabled にして
         「中身は変えられないが視覚的に値は見える」状態にする。
         注文 ID / status は確定後にのみ追加で表示する。 -->
    <form class="fields" @submit.prevent="submitOrder">
      <label>
        商品名
        <input
          v-model="itemName"
          type="text"
          required
          :disabled="confirmed"
        />
      </label>
      <div class="row">
        <label>
          数量
          <input
            v-model.number="itemQuantity"
            type="number"
            min="1"
            required
            :disabled="confirmed"
          />
        </label>
        <label>
          単価
          <input
            v-model.number="itemUnitPrice"
            type="number"
            min="0"
            required
            :disabled="confirmed"
          />
        </label>
        <label>
          通貨
          <input
            v-model="currency"
            type="text"
            maxlength="3"
            required
            :disabled="confirmed"
          />
        </label>
      </div>
      <p class="subtotal">
        合計: {{ subtotal }} {{ currency.toUpperCase() }}
        <span v-if="!confirmed && subtotal < 50" class="warn-inline">
          (Stripe の最小単位 50 未満)
        </span>
      </p>

      <!-- 確定前後で枠サイズが変わらないよう、meta は常に同じ高さの枠を確保。
           未確定時はプレースホルダ "-" を表示する。 -->
      <dl class="meta">
        <dt>Order ID</dt>
        <dd>
          <code v-if="confirmed">{{ store.order!.id }}</code>
          <span v-else class="placeholder">-</span>
        </dd>
        <dt>Status</dt>
        <dd>
          <code v-if="confirmed">{{ store.order!.status }}</code>
          <span v-else class="placeholder">-</span>
        </dd>
      </dl>

      <div class="actions">
        <button
          v-if="!confirmed"
          type="submit"
          :disabled="submitting || subtotal < 50"
        >
          {{ submitting ? '送信中…' : 'カートイン' }}
        </button>
        <button v-else type="button" class="secondary" @click="discard">
          カートを破棄してやり直し
        </button>
      </div>
    </form>
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

/* ボタンのスタイルは assets/main.css の共通定義に従う (上書きしない)。 */

.meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin: 0;
  font-size: 0.85rem;
}

.meta dt {
  font-weight: 600;
  opacity: 0.8;
}

.meta dd {
  margin: 0;
  word-break: break-all;
}

input:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.placeholder {
  opacity: 0.4;
  font-family: monospace;
}

code {
  font-family: monospace;
}
</style>
