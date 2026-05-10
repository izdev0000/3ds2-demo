<script setup lang="ts">
import { ref } from 'vue'
import { stripePspClient } from '@/services/StripePspClient'
import { usePaymentStore } from '@/stores/payment'

// Stripe TEST 環境のテストカード番号 + 1-click 実行用 PaymentMethod alias。
// alias を持つ card は Elements を経由せず pm_card_* を直接 confirm。
// alias 無しは copy のみ (manual paste 用)。
// 参照: https://docs.stripe.com/testing#cards-responses
interface TestCard {
  label: string
  number: string
  description: string
  alias?: string
}

const cards: TestCard[] = [
  {
    label: 'Visa (基本)',
    number: '4242 4242 4242 4242',
    description: '3DS 認証なしで成功',
    alias: 'pm_card_visa',
  },
  {
    label: '3DS2 frictionless',
    number: '4000 0084 0000 1629',
    description: 'チャレンジ無しで成功 (AReq → ARes 即承認)',
    alias: 'pm_card_threeDSecureOptional',
  },
  {
    label: '3DS2 challenge 通過',
    number: '4000 0027 6000 3184',
    description: 'チャレンジ画面 → 成功',
    alias: 'pm_card_authenticationRequired',
  },
  {
    label: '3DS2 challenge 失敗',
    number: '4000 0082 6000 3178',
    description: 'チャレンジ画面 → 認証失敗',
    alias: 'pm_card_authenticationRequiredChargeDeclinedInsufficientFunds',
  },
  {
    label: 'Decline',
    number: '4000 0000 0000 0002',
    description: '無条件で decline',
    alias: 'pm_card_chargeDeclined',
  },
]

const store = usePaymentStore()
const copiedNumber = ref<string | null>(null)
let resetTimer: number | null = null

async function copy(card: TestCard) {
  const raw = card.number.replace(/\s/g, '')
  try {
    await navigator.clipboard.writeText(raw)
  } catch {
    // 旧ブラウザ / 非 secure context フォールバック
    const ta = document.createElement('textarea')
    ta.value = raw
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  copiedNumber.value = card.number
  if (resetTimer !== null) clearTimeout(resetTimer)
  resetTimer = window.setTimeout(() => {
    copiedNumber.value = null
  }, 2000)
}

async function execute(card: TestCard) {
  if (!card.alias) return
  // 現在の flow を反映。server_redirect の時は returnUrl も付与。
  await store.start({
    amount: 100,
    currency: 'jpy',
    psp: stripePspClient,
    paymentMethodId: card.alias,
    flow: store.currentFlow,
    returnUrl:
      store.currentFlow === 'server_redirect'
        ? `${window.location.origin}/payments/return`
        : undefined,
  })
}

const isBusy = (phase: string) =>
  phase === 'preparing' ||
  phase === 'challenging' ||
  phase === 'redirecting'
</script>

<template>
  <aside class="test-cards">
    <h3>テストカード</h3>
    <p class="intro">
      Stripe Elements は iframe 隔離のため自動入力できません。「実行」は
      Elements を bypass して PM alias で直接 confirm (1-click)、「コピー」は
      左フォームに手動 paste 用。
    </p>
    <ul>
      <li v-for="card in cards" :key="card.number">
        <div class="meta">
          <span class="label">{{ card.label }}</span>
          <span class="desc">{{ card.description }}</span>
        </div>
        <code>{{ card.number }}</code>
        <div class="actions">
          <button
            v-if="card.alias"
            type="button"
            class="primary"
            :disabled="isBusy(store.phase)"
            @click="execute(card)"
          >
            実行
          </button>
          <button
            type="button"
            :class="{ copied: copiedNumber === card.number }"
            @click="copy(card)"
          >
            {{ copiedNumber === card.number ? 'コピー済' : 'コピー' }}
          </button>
        </div>
      </li>
    </ul>
    <p class="note">
      実行時の金額は 100 JPY 固定。手動入力時は左フォームの値を使用。
      有効期限 / CVC は TEST 環境では任意 (12 / 40, 123 等)。
    </p>
  </aside>
</template>

<style scoped>
.test-cards {
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.85rem;
}

.test-cards h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}

.intro {
  margin: 0 0 0.75rem;
  opacity: 0.75;
  line-height: 1.4;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

li {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background-soft);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.label {
  font-weight: 600;
}

.desc {
  font-size: 0.75rem;
  opacity: 0.7;
}

code {
  font-family: monospace;
  font-size: 0.85rem;
}

.actions {
  display: flex;
  gap: 0.4rem;
  justify-content: flex-end;
}

button {
  padding: 0.25rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
}

button.primary {
  background: var(--color-text);
  color: var(--color-background);
  border-color: var(--color-text);
}

button.primary:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

button.copied {
  color: #2a8;
  border-color: #2a8;
}

.note {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  opacity: 0.7;
  line-height: 1.4;
}
</style>
