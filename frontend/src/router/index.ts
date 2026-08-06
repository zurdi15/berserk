import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import { toastApiError } from '@/utils/apiErrors'
import BootstrapView from '@/views/BootstrapView.vue'
import LoginView from '@/views/LoginView.vue'
import RedeemView from '@/views/RedeemView.vue'
import TodayView from '@/views/TodayView.vue'
import CalendarView from '@/views/CalendarView.vue'
import ProfileView from '@/views/ProfileView.vue'
import ProgressView from '@/views/ProgressView.vue'
import ShellView from '@/views/ShellView.vue'
import WorkoutEditView from '@/views/WorkoutEditView.vue'
import WorkoutView from '@/views/WorkoutView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/bootstrap', name: 'bootstrap', component: BootstrapView },
    { path: '/invite/:token', name: 'invite', component: RedeemView },
    {
      path: '/',
      component: ShellView,
      redirect: { name: 'today' },
      children: [
        { path: 'today', name: 'today', component: TodayView },
        { path: 'calendar', name: 'calendar', component: CalendarView },
        { path: 'workout', name: 'workout', component: WorkoutView },
        { path: 'workout/:id/edit', name: 'workout-edit', component: WorkoutEditView },
        { path: 'progress', name: 'progress', component: ProgressView },
        { path: 'profile', name: 'profile', component: ProfileView },
      ],
    },
    // cualquier ruta desconocida cae en today en vez de una pantalla en blanco
    { path: '/:pathMatch(.*)*', redirect: { name: 'today' } },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  try {
    await auth.init()
  } catch (error) {
    // solo toastear si no estamos ya navegando al login (evitar doble toast)
    if (to.name !== 'login') {
      toastApiError(error)
    }
    // backend caído: el login es estático y es el único destino con sentido
    return to.name === 'login' ? true : { name: 'login' }
  }
  const isPublic = to.name === 'login' || to.name === 'bootstrap' || to.name === 'invite'
  if (!auth.bootstrapped && to.name !== 'bootstrap') return { name: 'bootstrap' }
  if (auth.bootstrapped && to.name === 'bootstrap') return auth.isAuthenticated ? { name: 'today' } : { name: 'login' }
  if (!auth.isAuthenticated && !isPublic) return { name: 'login' }
  if (auth.isAuthenticated && isPublic) return { name: 'today' }
})
