<script setup lang="ts">
import PaymentForm from '@/components/PaymentForm.vue'
import ChallengeView from '@/components/ChallengeView.vue'
import ResultView from '@/components/ResultView.vue'
import { usePaymentStore } from '@/stores/payment'

const store = usePaymentStore()
</script>

<template>
  <main class="payment-page">
    <h1>3DS2 Demo</h1>
    <p class="phase">phase: {{ store.phase }}</p>
    <PaymentForm v-if="store.phase === 'idle' || store.phase === 'preparing'" />
    <ChallengeView v-if="store.phase === 'challenging'" />
    <ResultView v-if="store.phase === 'succeeded' || store.phase === 'failed'" />
  </main>
</template>

<style scoped>
.payment-page {
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.phase {
  font-family: monospace;
  opacity: 0.7;
}
</style>
