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

// 決済処理中は overlay で全操作を block する。
// (タブ切替で in-flight 状態を破壊する race condition の防止が主目的)
const isBusy = computed(() =>
  ['preparing', 'challenging', 'redirecting'].includes(store.phase),
)

const busyMessage = computed(() => {
  switch (store.phase) {
    case 'preparing':
      return '決済を準備中…'
    case 'challenging':
      return '3DS2 認証中…'
    case 'redirecting':
      return '認証ページへ遷移中…'
    default:
      return ''
  }
})
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
        <ResultView
          v-if="store.phase === 'succeeded' || store.phase === 'failed'"
        />
      </div>
      <TestCardsPanel v-if="isFormPhase" class="aside" />
    </div>

    <div
      v-if="isBusy"
      class="busy-overlay"
      role="status"
      aria-live="polite"
      data-testid="busy-overlay"
    >
      <div class="busy-card">
        <div class="spinner" aria-hidden="true"></div>
        <p class="busy-message">{{ busyMessage }}</p>
        <p v-if="store.paymentIntentId" class="busy-meta">
          PaymentIntent: <code>{{ store.paymentIntentId }}</code>
        </p>
      </div>
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

@media (max-width: 720px) {
  .layout {
    flex-direction: column;
  }

  .aside {
    width: 100%;
  }
}

/* 決済中の全操作 block: pointer-events を捕捉、半透明背景で視覚的にも示す。
   Stripe の 3DS2 challenge iframe は z-index 9999+ なので overlay より上に出る。 */
.busy-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  cursor: wait;
}

.busy-card {
  background: var(--color-background);
  color: var(--color-text);
  padding: 1.5rem 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  max-width: 360px;
  text-align: center;
}

.spinner {
  width: 2rem;
  height: 2rem;
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

.busy-message {
  margin: 0;
  font-weight: 600;
}

.busy-meta {
  margin: 0;
  font-size: 0.75rem;
  opacity: 0.7;
  font-family: monospace;
  word-break: break-all;
}
</style>
