<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { ConfirmationFlow } from '@/services/payment'
import { usePaymentStore } from '@/stores/payment'

const store = usePaymentStore()
const { currentFlow } = storeToRefs(store)

function setFlow(flow: ConfirmationFlow) {
  if (currentFlow.value === flow) return
  currentFlow.value = flow
  store.reset()
}
</script>

<template>
  <nav class="tabs" aria-label="Confirmation flow">
    <button
      type="button"
      :class="{ active: currentFlow === 'client_sdk' }"
      @click="setFlow('client_sdk')"
    >
      Inline (Client SDK)
    </button>
    <button
      type="button"
      :class="{ active: currentFlow === 'server_redirect' }"
      @click="setFlow('server_redirect')"
    >
      Redirect (日本 PSP 風)
    </button>
  </nav>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
}

.tabs button {
  padding: 0.6rem 1rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--color-text);
  opacity: 0.6;
}

.tabs button:hover {
  opacity: 0.85;
}

.tabs button.active {
  opacity: 1;
  border-bottom-color: var(--color-text);
  font-weight: 600;
}
</style>
