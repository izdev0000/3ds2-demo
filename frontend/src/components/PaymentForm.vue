<script setup lang="ts">
// TODO(Phase 5): Stripe Elements でカード入力 UI を mount し、PaymentIntent を作成。
</script>

<template>
  <section class="payment-form">
    <h2>カード情報入力</h2>
    <p class="placeholder">Stripe Elements を Phase 5 で実装</p>
  </section>
</template>

<style scoped>
.payment-form {
  padding: 1rem;
  border: 1px dashed var(--color-border);
}

.placeholder {
  color: var(--color-text);
  opacity: 0.6;
}
</style>
