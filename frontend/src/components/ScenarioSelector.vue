<script setup lang="ts">
import { computed } from 'vue'
import { SCENARIOS, useScenarioStore, type ScenarioId } from '@/stores/scenario'

const store = useScenarioStore()

function pick(id: ScenarioId) {
  store.pick(id)
}

const activeDescription = computed(
  () => SCENARIOS.find((s) => s.id === store.current)?.description ?? '',
)
</script>

<template>
  <section class="scenario-selector">
    <header>
      <h3>シミュレーション scenario</h3>
      <p class="hint">
        frontend mock で意図的に失敗 / 遅延を再現する。Stripe テストカードで
        再現できない「実環境では起きうる」失敗を学習するための仕組み。
      </p>
    </header>
    <ul>
      <li v-for="s in SCENARIOS" :key="s.id">
        <label :class="{ active: store.current === s.id }">
          <input
            type="radio"
            name="scenario"
            :value="s.id"
            :checked="store.current === s.id"
            @change="pick(s.id)"
          />
          <span class="label">{{ s.label }}</span>
        </label>
      </li>
    </ul>
    <p class="active-desc">{{ activeDescription }}</p>
  </section>
</template>

<style scoped>
.scenario-selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px dashed var(--color-border);
  border-radius: 4px;
  background: var(--color-background-soft);
}

header h3 {
  margin: 0 0 0.25rem;
  font-size: 0.95rem;
}

.hint {
  margin: 0;
  font-size: 0.78rem;
  opacity: 0.7;
  line-height: 1.4;
}

ul {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.82rem;
  background: var(--color-background);
}

label.active {
  border-color: #2a8;
  background: rgba(42, 136, 80, 0.08);
}

input[type='radio'] {
  margin: 0;
}

.active-desc {
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
  opacity: 0.85;
  line-height: 1.4;
}
</style>
