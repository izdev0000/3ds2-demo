<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { getPaymentIntent, type PaymentResponse } from '@/services/payment'

// docs/design/confirmation-flow.md §8 の ID 逆引き戦略:
// Strategy C: return_url の query (?txn=txn_xxx) が Stripe 経由で戻ってくる
// Strategy B: フォールバックで sessionStorage を見る
const REDIRECT_TXN_KEY = 'redirect-txn-id'

const route = useRoute()
const txnId = ref<string | null>(null)
const payment = ref<PaymentResponse | null>(null)
const errorMessage = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  const queryTxn = route.query.txn
  let id: string | null = null
  if (typeof queryTxn === 'string' && queryTxn.length > 0) {
    id = queryTxn
  } else {
    id = sessionStorage.getItem(REDIRECT_TXN_KEY)
  }

  if (!id) {
    errorMessage.value = '内部 transaction ID が取得できませんでした'
    loading.value = false
    return
  }
  txnId.value = id
  // 取得成功・失敗どちらでも store からは消す (再訪を防ぐ)
  sessionStorage.removeItem(REDIRECT_TXN_KEY)

  try {
    payment.value = await getPaymentIntent(id)
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="payment-return">
    <h1>決済結果 (redirect 戻り)</h1>

    <p v-if="loading">取得中…</p>

    <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>

    <section v-else-if="payment" class="result" :class="payment.status">
      <h2>{{ payment.status === 'succeeded' ? '✅ 成功' : payment.status }}</h2>
      <dl>
        <dt>PaymentIntent</dt>
        <dd><code>{{ payment.id }}</code></dd>
        <dt>Status</dt>
        <dd><code>{{ payment.status }}</code></dd>
        <dt>金額</dt>
        <dd>{{ payment.amount }} {{ payment.currency.toUpperCase() }}</dd>
      </dl>
    </section>

    <p>
      <RouterLink to="/">最初に戻る</RouterLink>
    </p>
  </main>
</template>

<style scoped>
.payment-return {
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.result {
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.result.succeeded h2 {
  color: #2a8;
}

.result h2 {
  margin: 0 0 0.5rem;
}

dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin: 0;
  font-size: 0.9rem;
}

dt {
  font-weight: 600;
  opacity: 0.8;
}

dd {
  margin: 0;
  word-break: break-all;
}

code {
  font-family: monospace;
}

.error {
  color: #c00;
}
</style>
