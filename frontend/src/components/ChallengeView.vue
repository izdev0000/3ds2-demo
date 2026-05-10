<script setup lang="ts">
// TODO(Phase 5): next_action.use_stripe_sdk / redirect_to_url のハンドリング。
// EMVCo 3DS2 の CReq/CRes フェーズに相当。
</script>

<template>
  <section class="challenge">
    <h2>3DS2 チャレンジ</h2>
    <p class="placeholder">PaymentIntent.next_action 受信時に inline / redirect 表示</p>
  </section>
</template>

<style scoped>
.challenge {
  padding: 1rem;
  border: 1px dashed var(--color-border);
}

.placeholder {
  color: var(--color-text);
  opacity: 0.6;
}
</style>
