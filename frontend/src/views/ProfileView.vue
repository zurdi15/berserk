<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { toastApiError } from '@/utils/apiErrors'
import { useTabHash } from '@/composables/useTabHash'
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

type ProfileTab = 'profile' | 'routines' | 'library' | 'admin'
// item 5 (v0.4.2): sub-selector DENTRO del panel Biblioteca — no anclado al
// hash (a diferencia de activeTab): el hash solo distingue PANELES de
// perfil, no el estado de un widget dentro de uno. #library sigue llegando
// siempre al mismo sitio, con Ejercicios por defecto.
type LibrarySection = 'exercises' | 'muscleGroups'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

// item 1 (v0.3.2): #admin no es válido para un no-admin — cae al default
// (ver useTabHash), aunque llegue por hash de un enlace viejo/compartido
function validProfileTabs(): ProfileTab[] {
  const base: ProfileTab[] = ['profile', 'routines', 'library']
  return auth.user?.is_admin ? [...base, 'admin'] : base
}

const activeTab = useTabHash<ProfileTab>('profile', validProfileTabs)

// item 5: mini BkTabs, mismo idioma que el filtro de kind de récords (ver
// PrList) — un toggle de qué manager se ve, no una sección nueva
const librarySection = ref<LibrarySection>('exercises')
const librarySectionTabs = computed(() => [
  { value: 'exercises', label: t('library.exercises') },
  { value: 'muscleGroups', label: t('library.muscleGroups') },
])

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
         mismo tratamiento que Rutinas). item 5 (v0.4.2): layout de pestañas
         de récords — mini selector Ejercicios/Grupos musculares en vez de
         los dos managers apilados, uno visible a la vez. AMBOS managers se
         montan juntos al entrar al panel (como antes) — solo el visible se
         alterna con v-show, nunca v-if: así el flip del selector es un
         cambio de DATO (qué manager mirar), no de sección, y no repite la
         animación de entrada ni relanza la carga/gating propia de cada
         manager (mismo idioma que el filtro de kind de récords, ver
         PrList.vue). El gating de "primer montaje" de cada manager (su
         propio ready/skeleton) no cambia: solo pasa una vez, al entrar aquí. -->
    <div v-if="activeTab === 'library'" class="space-y-4 bk-stagger">
      <div :style="{ '--bk-stagger-i': 0 }">
        <BkTabs data-testid="library-section-tabs" v-model="librarySection" :tabs="librarySectionTabs" />
      </div>
      <div :style="{ '--bk-stagger-i': 1 }">
        <div v-show="librarySection === 'exercises'"><ExerciseManager /></div>
        <div v-show="librarySection === 'muscleGroups'"><MuscleGroupManager /></div>
      </div>
    </div>

    <Transition name="bk-rise" appear>
      <AdminCard v-if="activeTab === 'admin' && auth.user?.is_admin" />
    </Transition>
  </div>
</template>
