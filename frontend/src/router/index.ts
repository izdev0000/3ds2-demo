import { createRouter, createWebHistory } from 'vue-router'
import PaymentPage from '@/views/PaymentPage.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'payment',
      component: PaymentPage,
    },
    {
      // server_redirect flow の戻り先 (Stripe issuer ページから return される)
      path: '/payments/return',
      name: 'payment-return',
      component: () => import('@/views/PaymentReturn.vue'),
    },
  ],
})

export default router
