<script setup lang="ts">
import { usePaymentStore } from '@/stores/payment'

const store = usePaymentStore()
</script>

<template>
  <section class="challenge">
    <h2>3DS2 チャレンジ実行中</h2>
    <p>
      カード発行会社の認証画面を表示しています（PSP SDK が
      iframe を制御）。EMVCo §6.5 CReq → CRes に相当。
    </p>
    <p v-if="store.paymentIntentId" class="meta">
      PaymentIntent: <code>{{ store.paymentIntentId }}</code>
    </p>
    <div class="spinner" aria-label="loading"></div>
  </section>
</template>

<style scoped>
.challenge {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.meta {
  font-family: monospace;
  font-size: 0.85rem;
  opacity: 0.8;
}

.spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-text);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
