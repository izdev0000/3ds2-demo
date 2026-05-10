<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { isLockedByOther, onChange } from '@/services/paymentLock'
import type { MountedCardForm } from '@/services/PspClient'
import { stripePspClient } from '@/services/StripePspClient'
import { usePaymentStore } from '@/stores/payment'

const numberMount = ref<HTMLDivElement | null>(null)
const expiryMount = ref<HTMLDivElement | null>(null)
const cvcMount = ref<HTMLDivElement | null>(null)
const amount = ref<number>(100)
const currency = ref<string>('jpy')
const mountError = ref<string | null>(null)
const isMounted = ref<boolean>(false)
const lockedByOther = ref<boolean>(false)

const store = usePaymentStore()
const psp = stripePspClient
let mounted: MountedCardForm | null = null
let unsubLock: (() => void) | null = null

onMounted(async () => {
  if (!numberMount.value || !expiryMount.value || !cvcMount.value) {
    mountError.value = 'mount 先 element が未取得'
    return
  }
  try {
    mounted = await psp.mountCardForm(
      {
        number: numberMount.value,
        expiry: expiryMount.value,
        cvc: cvcMount.value,
      },
      {
        placeholders: {
          number: '4100 0000 0000 0100',
          expiry: '12 / 40',
          cvc: '123',
        },
      },
    )
    isMounted.value = true
  } catch (e) {
    mountError.value = e instanceof Error ? e.message : String(e)
    return
  }

  lockedByOther.value = isLockedByOther()
  unsubLock = onChange(() => {
    lockedByOther.value = isLockedByOther()
  })
})

onBeforeUnmount(() => {
  mounted?.unmount()
  unsubLock?.()
})

async function submit() {
  if (!mounted) {
    mountError.value = 'カード入力 UI が未準備です'
    return
  }
  await store.start({
    amount: amount.value,
    currency: currency.value,
    psp,
    card: mounted.card,
  })
}
</script>

<template>
  <form class="payment-form" @submit.prevent="submit">
    <h2>カード情報入力</h2>

    <p v-if="mountError" class="error">{{ mountError }}</p>
    <p v-if="lockedByOther" class="warn">
      別 tab で決済処理中のため、この tab からは送信できません。
    </p>

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
      カード番号
      <div ref="numberMount" class="card-element"></div>
    </label>

    <div class="row">
      <label class="card-label">
        有効期限
        <div ref="expiryMount" class="card-element"></div>
      </label>
      <label class="card-label">
        CVC
        <div ref="cvcMount" class="card-element"></div>
      </label>
    </div>

    <button
      type="submit"
      :disabled="!isMounted || store.phase === 'preparing' || lockedByOther"
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
  flex: 1;
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

.warn {
  color: #b58900;
  font-size: 0.85rem;
  padding: 0.5rem;
  background: rgba(181, 137, 0, 0.1);
  border-left: 3px solid #b58900;
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
