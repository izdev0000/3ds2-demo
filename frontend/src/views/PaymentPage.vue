<script setup lang="ts">
import { computed } from 'vue'
import PaymentForm from '@/components/PaymentForm.vue'
import PaymentFlowTabs from '@/components/PaymentFlowTabs.vue'
import ChallengeView from '@/components/ChallengeView.vue'
import ResultView from '@/components/ResultView.vue'
import TestCardsPanel from '@/components/TestCardsPanel.vue'
import { usePaymentStore } from '@/stores/payment'

const store = usePaymentStore()

// idle / preparing の間だけ form と test cards を表示する。
const isFormPhase = computed(
  () => store.phase === 'idle' || store.phase === 'preparing',
)
</script>

<template>
  <main class="payment-page">
    <h1>3DS2 Demo</h1>
    <PaymentFlowTabs />
    <p class="phase">
      phase: {{ store.phase }} / flow: {{ store.currentFlow }}
    </p>
    <div class="layout">
      <div class="primary">
        <PaymentForm v-if="isFormPhase" />
        <ChallengeView v-if="store.phase === 'challenging'" />
        <p v-else-if="store.phase === 'redirecting'" class="redirecting">
          認証ページへ遷移しています…
        </p>
        <ResultView
          v-if="store.phase === 'succeeded' || store.phase === 'failed'"
        />
      </div>
      <TestCardsPanel v-if="isFormPhase" class="aside" />
    </div>
  </main>
</template>

<style scoped>
.payment-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.phase {
  font-family: monospace;
  opacity: 0.7;
  font-size: 0.85rem;
}

.layout {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.primary {
  flex: 1 1 auto;
  min-width: 0;
}

.aside {
  width: 280px;
  flex-shrink: 0;
}

.redirecting {
  padding: 1rem;
  border: 1px dashed var(--color-border);
  border-radius: 4px;
  font-style: italic;
}

@media (max-width: 720px) {
  .layout {
    flex-direction: column;
  }

  .aside {
    width: 100%;
  }
}
</style>
