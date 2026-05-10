<script setup lang="ts">
// TODO(Phase 5): 最終 status と webhook 反映の可視化。
</script>

<template>
  <section class="result">
    <h2>結果</h2>
    <p class="placeholder">PaymentIntent 確定後の状態を表示</p>
  </section>
</template>

<style scoped>
.result {
  padding: 1rem;
  border: 1px dashed var(--color-border);
}

.placeholder {
  color: var(--color-text);
  opacity: 0.6;
}
</style>
