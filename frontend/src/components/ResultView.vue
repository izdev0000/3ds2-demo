<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { usePaymentStore } from '@/stores/payment'
import { useScenarioStore } from '@/stores/scenario'
import { getOrder, type OrderResponse } from '@/services/order'

const store = usePaymentStore()
const scenario = useScenarioStore()
const isSuccess = computed(() => store.phase === 'succeeded')

// 業務的な確定は Order.status === 'paid' で判定する (docs/design/error-handling.md §8.4)。
// Stripe confirm が succeeded でも webhook 未着なら Order は pending のまま。
const order = ref<OrderResponse | null>(null)
const orderError = ref<string | null>(null)
const fetching = ref(false)
// 離脱 scenario では「user が居なくなった」体で初回 fetch をしない。
const skipInitialFetch = computed(
  () => scenario.current === 'abandon_after_success',
)

async function fetchOrder() {
  if (!store.order) return
  fetching.value = true
  orderError.value = null
  try {
    order.value = await getOrder(store.order.id)
  } catch (e) {
    orderError.value = e instanceof Error ? e.message : String(e)
  } finally {
    fetching.value = false
  }
}

onMounted(() => {
  if (!isSuccess.value) return
  if (skipInitialFetch.value) return
  void fetchOrder()
})
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
      <template v-if="store.order">
        <dt>Order ID</dt>
        <dd><code>{{ store.order.id }}</code></dd>
      </template>
      <template v-if="order">
        <dt>Order.status</dt>
        <dd>
          <code :class="{ 'order-pending': order.status === 'pending' }">
            {{ order.status }}
          </code>
        </dd>
      </template>
    </dl>

    <!-- 離脱 scenario: 結果を見ずに離脱した user の体 -->
    <div v-if="isSuccess && skipInitialFetch && !order" class="info abandoned">
      <p>
        🚪 <strong>離脱を模擬中</strong>:
        user は結果を確認せずブラウザを閉じた想定。
      </p>
      <p>
        backend では webhook が <code>payment_intent.succeeded</code>
        を受けて Order.status を <code>paid</code> に更新しています。
        UI がそれを見ないだけで、業務確定は進んでいる。
      </p>
      <button type="button" @click="fetchOrder">
        後で再訪したと仮定して Order を取得
      </button>
    </div>

    <!-- webhook 遅延 scenario: 取得しても pending のまま -->
    <div
      v-if="isSuccess && order?.status === 'pending'"
      class="info delayed"
    >
      <p>
        ⏳ Stripe では succeeded だが、Order は <code>pending</code> のまま。
        webhook がまだ届いていない可能性 (実環境では数秒〜数十秒の差はある)。
      </p>
      <button type="button" :disabled="fetching" @click="fetchOrder">
        {{ fetching ? '取得中…' : '再取得' }}
      </button>
    </div>

    <p v-if="orderError" class="error">Order 取得失敗: {{ orderError }}</p>

    <!-- 成功後は Order が paid 確定なので、新しい注文からやり直すために
         Order ごとリセットする -->
    <button class="reset" @click="store.resetOrder()">最初に戻る</button>
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

.order-pending {
  color: #b58900;
}

.info {
  padding: 0.6rem 0.75rem;
  border-radius: 4px;
  font-size: 0.85rem;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.info p {
  margin: 0;
}

.abandoned {
  background: rgba(96, 96, 160, 0.08);
  border-left: 3px solid #66a;
}

.delayed {
  background: rgba(181, 137, 0, 0.08);
  border-left: 3px solid #b58900;
}

.error {
  margin: 0;
  color: #c00;
  font-size: 0.85rem;
}

button {
  align-self: flex-start;
  padding: 0.4rem 1rem;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
