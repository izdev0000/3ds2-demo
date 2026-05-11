<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  fetchRecentRows,
  type DebugRecentRows,
} from '@/services/debug'

const data = ref<DebugRecentRows | null>(null)
const errorMessage = ref<string | null>(null)
const loading = ref(false)
const lastFetchedAt = ref<Date | null>(null)
const autoRefresh = ref(true)

let intervalId: number | null = null
const POLL_MS = 3000

async function refresh() {
  loading.value = true
  errorMessage.value = null
  try {
    data.value = await fetchRecentRows()
    lastFetchedAt.value = new Date()
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function startPolling() {
  if (intervalId !== null) return
  intervalId = window.setInterval(() => {
    if (autoRefresh.value) void refresh()
  }, POLL_MS)
}

function stopPolling() {
  if (intervalId !== null) {
    window.clearInterval(intervalId)
    intervalId = null
  }
}

onMounted(() => {
  void refresh()
  startPolling()
})

onBeforeUnmount(() => {
  stopPolling()
})

function shortId(id: string | null | undefined, head = 16): string {
  if (!id) return '-'
  return id.length > head ? id.slice(0, head) + '…' : id
}

function formatTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString('ja-JP', { hour12: false }) + '.' +
    String(d.getMilliseconds()).padStart(3, '0').slice(0, 2)
}
</script>

<template>
  <section class="recent-rows">
    <header>
      <h3>DB 直近 5 行 (データフロー可視化)</h3>
      <div class="controls">
        <label class="toggle">
          <input v-model="autoRefresh" type="checkbox" />
          自動更新 (3 秒)
        </label>
        <button type="button" class="secondary" @click="refresh" :disabled="loading">
          {{ loading ? '取得中…' : '再取得' }}
        </button>
        <span v-if="lastFetchedAt" class="meta">
          last: {{ formatTime(lastFetchedAt.toISOString()) }}
        </span>
      </div>
    </header>

    <p v-if="errorMessage" class="error">取得失敗: {{ errorMessage }}</p>

    <div v-if="data" class="grid">
      <!-- orders -->
      <div class="table-card">
        <h4>orders</h4>
        <table v-if="data.orders.length">
          <thead>
            <tr>
              <th>id</th>
              <th>status</th>
              <th>amount</th>
              <th>created</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in data.orders" :key="o.id">
              <td><code>{{ shortId(o.id) }}</code></td>
              <td><code :class="`s-${o.status}`">{{ o.status }}</code></td>
              <td>{{ o.amount }} {{ o.currency.toUpperCase() }}</td>
              <td>{{ formatTime(o.created_at) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">(no rows)</p>
      </div>

      <!-- transactions -->
      <div class="table-card">
        <h4>transactions</h4>
        <table v-if="data.transactions.length">
          <thead>
            <tr>
              <th>id</th>
              <th>order_id</th>
              <th>status</th>
              <th>pi</th>
              <th>created</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in data.transactions" :key="t.id">
              <td><code>{{ shortId(t.id) }}</code></td>
              <td><code>{{ shortId(t.order_id) }}</code></td>
              <td><code :class="`s-${t.status}`">{{ t.status }}</code></td>
              <td><code>{{ shortId(t.psp_payment_intent_id, 12) }}</code></td>
              <td>{{ formatTime(t.created_at) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">(no rows)</p>
      </div>

      <!-- order_items -->
      <div class="table-card">
        <h4>order_items</h4>
        <table v-if="data.order_items.length">
          <thead>
            <tr>
              <th>id</th>
              <th>order_id</th>
              <th>name</th>
              <th>qty</th>
              <th>unit_price</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in data.order_items" :key="i.id">
              <td><code>{{ shortId(i.id) }}</code></td>
              <td><code>{{ shortId(i.order_id) }}</code></td>
              <td>{{ i.name }}</td>
              <td>{{ i.quantity }}</td>
              <td>{{ i.unit_price }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">(no rows)</p>
      </div>

      <!-- webhook_events -->
      <div class="table-card">
        <h4>webhook_events</h4>
        <table v-if="data.webhook_events.length">
          <thead>
            <tr>
              <th>id</th>
              <th>event_type</th>
              <th>tx_id</th>
              <th>received</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in data.webhook_events" :key="e.id">
              <td><code>{{ shortId(e.id) }}</code></td>
              <td><code>{{ e.event_type }}</code></td>
              <td><code>{{ shortId(e.transaction_id) }}</code></td>
              <td>{{ formatTime(e.received_at) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">(no rows)</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.recent-rows {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px dashed var(--color-border);
  border-radius: 4px;
  background: var(--color-background-soft);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

header h3 {
  margin: 0;
  font-size: 0.95rem;
}

.controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}

/* 「再取得」/「取得中…」で文字幅が変わって header が左右に揺れるのを防ぐため、
   button に固定幅を与える。 */
.controls button {
  min-width: 6.5em;
  text-align: center;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.meta {
  opacity: 0.65;
  font-family: monospace;
}

.error {
  color: #c00;
  font-size: 0.85rem;
  margin: 0;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

@media (max-width: 720px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

.table-card {
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 0.5rem 0.6rem;
  background: var(--color-background);
}

.table-card h4 {
  margin: 0 0 0.4rem;
  font-size: 0.85rem;
  font-family: monospace;
  opacity: 0.85;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}

th,
td {
  padding: 0.2rem 0.35rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

th {
  font-weight: 600;
  opacity: 0.7;
}

tr:last-child td {
  border-bottom: none;
}

code {
  font-family: monospace;
  font-size: 0.7rem;
}

/* status color hints */
.s-paid,
.s-succeeded {
  color: #2a8;
}

.s-pending,
.s-requires_action,
.s-requires_payment_method,
.s-requires_confirmation,
.s-processing {
  color: #b58900;
}

.s-canceled,
.s-refunded {
  color: #999;
}

.empty {
  margin: 0;
  font-size: 0.75rem;
  opacity: 0.6;
}
</style>
