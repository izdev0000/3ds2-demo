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
  ],
})

export default router
