<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

// item 14 (v0.4.3, zurdi): el panel Biblioteca es el ÚNICO caso de este
// archivo donde el reset de scroll NO llega gratis con un remount de
// RouterView/v-if — exercises/muscleGroups comparten el MISMO contenedor de
// scroll (v-show, nunca v-if: ver el comentario largo más abajo), así que
// si el usuario bajó viendo Ejercicios y cambia a Grupos musculares, sin
// esto seguiría viendo Grupos musculares YA desplazado hacia abajo. El
// resto de paneles (profile/routines/library en sí/admin) se remontan
// enteros al cambiar de pestaña vía activeTab (v-if), así que su propio
// contenedor de scroll nace en 0 sin ningún código aquí.
const libraryScrollEl = ref<HTMLElement | null>(null)
watch(librarySection, () => {
  if (libraryScrollEl.value) libraryScrollEl.value.scrollTop = 0
})

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

// item 14 (v0.4.3, zurdi generaliza el modelo de scroll interno a TODAS las
// vistas, empezando por Perfil/Progresión): la raíz lleva h-full flex
// flex-col (referencia de altura ya provista por el wrapper del shell, ver
// ShellView.vue) — BkTabs queda shrink-0 (tira de pestañas SIEMPRE
// visible), y CADA panel es flex-1 min-h-0 overflow-y-auto: el contenido de
// la pestaña activa scrollea DENTRO de su propio hueco, nunca contra
// <main> — antes esta vista entera scrolleaba contra <main>, así que Admin
// con una tabla larga de usuarios se llevaba la tira de pestañas fuera de
// la vista al bajar.
// (comentario aquí y no como primer hijo de <template>: un comentario ahí
// convierte la raíz en un fragmento de dos nodos y rompe wrapper.classes()
// en los tests, ver el mismo criterio en BkStepper.vue/TodayView.vue.)
</script>

<template>
  <div class="h-full flex flex-col gap-4">
    <BkTabs class="shrink-0" v-model="activeTab" :tabs="tabs" />

    <!-- bk-stagger en cada panel: v-if remonta el panel entero al cambiar de
         pestaña, y eso por sí solo repite la animación de entrada (item 4/7)
         — el mismo remount también resetea el scroll a 0 gratis (item 14/4:
         un contenedor de scroll recién creado por v-if nace sin posición
         previa), sin código de reset dedicado aquí. -->
    <div v-if="activeTab === 'profile'" class="flex-1 min-h-0 overflow-y-auto space-y-4 bk-stagger">
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

    <!-- un único hijo: bk-rise en vez de bk-stagger (nada que escalonar).
         flex-1 min-h-0 overflow-y-auto en el propio RoutineList (fallthrough
         de clase a su raíz — ver RoutineList.vue): Transition no pinta nodo
         propio, así que la clase llega directa al panel real. -->
    <Transition name="bk-rise" appear>
      <RoutineList v-if="activeTab === 'routines'" class="flex-1 min-h-0 overflow-y-auto" />
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
         propio ready/skeleton) no cambia: solo pasa una vez, al entrar aquí.
         item 14: flex-1 min-h-0 flex-col en el panel (chain, no scroll
         propio) — el selector queda shrink-0 (fijo dentro del panel, mismo
         criterio que la tira de pestañas de arriba) y el hueco de abajo es
         la ÚNICA región de scroll (ref libraryScrollEl): antes item 13 le
         daba scroll propio a esta región Y el panel entero también
         scrolleaba — dos contenedores anidados por el mismo contenido, un
         antipatrón que item 14 explícitamente pide simplificar a uno. -->
    <div v-if="activeTab === 'library'" class="flex-1 min-h-0 flex flex-col bk-stagger">
      <div class="shrink-0" :style="{ '--bk-stagger-i': 0 }">
        <BkTabs data-testid="library-section-tabs" v-model="librarySection" :tabs="librarySectionTabs" />
      </div>
      <div ref="libraryScrollEl" class="flex-1 min-h-0 overflow-y-auto" :style="{ '--bk-stagger-i': 1 }">
        <div v-show="librarySection === 'exercises'"><ExerciseManager /></div>
        <div v-show="librarySection === 'muscleGroups'"><MuscleGroupManager /></div>
      </div>
    </div>

    <!-- item 14: mismo criterio que RoutineList arriba — flex-1 min-h-0
         overflow-y-auto llega por fallthrough a la raíz real de AdminCard -->
    <Transition name="bk-rise" appear>
      <AdminCard v-if="activeTab === 'admin' && auth.user?.is_admin" class="flex-1 min-h-0 overflow-y-auto" />
    </Transition>
  </div>
</template>
