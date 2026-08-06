<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { toastApiError } from '@/utils/apiErrors'
import BkTabs from '@/lib/BkTabs.vue'
import BkButton from '@/lib/BkButton.vue'
import SettingsCard from '@/components/profile/SettingsCard.vue'
import PasswordCard from '@/components/profile/PasswordCard.vue'
import SharingCard from '@/components/profile/SharingCard.vue'
import AdminCard from '@/components/profile/AdminCard.vue'
import RoutineList from '@/components/routines/RoutineList.vue'
import ExerciseManager from '@/components/library/ExerciseManager.vue'
import MuscleGroupManager from '@/components/library/MuscleGroupManager.vue'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const activeTab = ref('profile')

// Compute tabs based on user role
const tabs = computed(() => {
  const baseTabs = [
    { value: 'profile', label: t('profile.tab') },
    { value: 'routines', label: t('profile.routinesTab') },
    { value: 'library', label: t('profile.libraryTab') },
  ]

  if (auth.user?.is_admin) {
    baseTabs.push({ value: 'admin', label: t('profile.adminTab') })
  }

  return baseTabs
})

async function handleLogout() {
  try {
    await auth.logout()
    router.push({ name: 'login' })
  } catch (error) {
    toastApiError(error)
  }
}
</script>

<template>
  <div class="space-y-4">
    <BkTabs v-model="activeTab" :tabs="tabs" />

    <!-- bk-stagger en cada panel: v-if remonta el panel entero al cambiar de
         pestaña, y eso por sí solo repite la animación de entrada (item 4/7) -->
    <div v-if="activeTab === 'profile'" class="space-y-4 bk-stagger">
      <div :style="{ '--bk-stagger-i': 0 }"><SettingsCard /></div>
      <div :style="{ '--bk-stagger-i': 1 }"><PasswordCard /></div>
      <div :style="{ '--bk-stagger-i': 2 }"><SharingCard /></div>

      <!-- item 12: fila completa, danger — cerrar sesión es la acción más
           "destructiva" visible del perfil, se trata como tal (mismo criterio
           que el resto de acciones danger de la app, p.ej. borrar cuenta) -->
      <BkButton
        variant="danger"
        block
        data-testid="logout-btn"
        :style="{ '--bk-stagger-i': 3 }"
        @click="handleLogout"
      >
        {{ $t('profile.logout') }}
      </BkButton>
    </div>

    <!-- un único hijo: bk-rise en vez de bk-stagger (nada que escalonar) -->
    <Transition name="bk-rise" appear>
      <RoutineList v-if="activeTab === 'routines'" />
    </Transition>

    <!-- item 10: sin título "Biblioteca" (la pestaña de Perfil ya lo dice,
         mismo tratamiento que Rutinas) -->
    <div v-if="activeTab === 'library'" class="space-y-4 bk-stagger">
      <div :style="{ '--bk-stagger-i': 0 }"><ExerciseManager /></div>
      <div :style="{ '--bk-stagger-i': 1 }"><MuscleGroupManager /></div>
    </div>

    <Transition name="bk-rise" appear>
      <AdminCard v-if="activeTab === 'admin' && auth.user?.is_admin" />
    </Transition>
  </div>
</template>
