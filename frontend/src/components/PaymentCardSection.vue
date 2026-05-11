<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { isLockedByOther, onChange } from '@/services/paymentLock'
import type { MountedCardForm } from '@/services/PspClient'
import { pspClient } from '@/services/psp'
import { usePaymentStore } from '@/stores/payment'

const numberMount = ref<HTMLDivElement | null>(null)
const expiryMount = ref<HTMLDivElement | null>(null)
const cvcMount = ref<HTMLDivElement | null>(null)
const mountError = ref<string | null>(null)
const isMounted = ref<boolean>(false)
const lockedByOther = ref<boolean>(false)

const store = usePaymentStore()
const psp = pspClient
let mounted: MountedCardForm | null = null
let unsubLock: (() => void) | null = null

const orderConfirmed = computed(() => store.order !== null)
const disabled = computed(
  () =>
    !orderConfirmed.value ||
    !isMounted.value ||
    lockedByOther.value ||
    store.phase === 'preparing' ||
    store.phase === 'challenging' ||
    store.phase === 'redirecting',
)

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

async function pay() {
  if (!mounted || !store.order) return
  await store.start({
    orderId: store.order.id,
    psp,
    card: mounted.card,
    flow: store.currentFlow,
    returnUrl:
      store.currentFlow === 'server_redirect'
        ? `${window.location.origin}/payments/return`
        : undefined,
  })
}
</script>

<template>
  <section class="card-section" :class="{ inactive: !orderConfirmed }">
    <header>
      <h2>② 決済</h2>
      <span v-if="!orderConfirmed" class="badge inactive-badge">
        先にカートインしてください
      </span>
    </header>

    <p v-if="mountError" class="error">{{ mountError }}</p>
    <p v-if="lockedByOther" class="warn">
      別 tab で決済処理中のため、この tab からは送信できません。
    </p>
    <p v-if="store.errorMessage && store.phase === 'failed'" class="error">
      決済失敗: {{ store.errorMessage }}<br />
      別カードで再試行できます (同じ Order に対して新規 Transaction を作成)。
    </p>

    <form class="fields" @submit.prevent="pay">
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

      <button type="submit" :disabled="disabled">
        {{ store.phase === 'preparing' ? '送信中…' : '支払う' }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.card-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.card-section.inactive {
  opacity: 0.6;
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

.inactive-badge {
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  opacity: 0.8;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.row {
  display: flex;
  gap: 1rem;
}

.row label {
  flex: 1;
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

/* ボタンは assets/main.css の共通定義に従う。 */
</style>
