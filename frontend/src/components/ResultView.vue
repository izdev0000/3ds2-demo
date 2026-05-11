<script setup lang="ts">
import { computed } from 'vue'
import { usePaymentStore } from '@/stores/payment'

const store = usePaymentStore()
const isSuccess = computed(() => store.phase === 'succeeded')
</script>

<template>
  <section class="result" :class="isSuccess ? 'ok' : 'ng'">
    <h2>{{ isSuccess ? '✅ 成功' : '❌ 失敗' }}</h2>

    <dl>
      <template v-if="store.paymentIntentId">
        <dt>PaymentIntent</dt>
        <dd><code>{{ store.paymentIntentId }}</code></dd>
      </template>
      <template v-if="store.finalStatus">
        <dt>最終 status</dt>
        <dd><code>{{ store.finalStatus }}</code></dd>
      </template>
      <template v-if="store.errorMessage">
        <dt>エラー</dt>
        <dd>{{ store.errorMessage }}</dd>
      </template>
    </dl>

    <!-- 成功後は Order が paid 確定なので、新しい注文からやり直すために
         Order ごとリセットする -->
    <button @click="store.resetOrder()">最初に戻る</button>
  </section>
</template>

<style scoped>
.result {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.result.ok h2 {
  color: #2a8;
}

.result.ng h2 {
  color: #c00;
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

button {
  align-self: flex-start;
  padding: 0.4rem 1rem;
  cursor: pointer;
}
</style>
