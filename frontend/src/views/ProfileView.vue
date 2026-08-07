<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { toastApiError } from '@/utils/apiErrors'
import { useTabHash } from '@/composables/useTabHash'
import { resetMainScroll } from '@/composables/useMainScroll'
import BkSheet from '@/lib/BkSheet.vue'
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
// v0.9.0 (zurdi: "no me convence en biblioteca el layout de doble tab"):
// muere el sub-selector Ejercicios/Grupos — la biblioteca ES el catálogo de
// ejercicios (lo que se consulta y toca de verdad), y los grupos musculares
// (mantenimiento ocasional) se gestionan desde un sheet abierto por un
// botón: jerarquía primario/secundario en vez de dos niveles de tabs, mismo
// idiom de drawers que el resto de flujos secundarios de la app.
const groupsSheetOpen = ref(false)

// v0.5.0 (modelo de scroll único): los paneles ya no tienen scroller propio
// que nazca en 0 al remontar — cambiar de pestaña (activeTab, cambia el
// hash, NO el path: el reset de ShellView no lo ve) debe resetear el scroll
// de <main> explícitamente, o el panel nuevo aparece ya desplazado.
watch(activeTab, () => {
  resetMainScroll()
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

// v0.5.0 (modelo de scroll único, ver ShellView.vue): la raíz FLUYE y las
// tiras de pestañas viven en UN único bloque sticky arriba — la principal y,
// solo en Biblioteca, la de sección debajo (agruparlas en un solo bloque
// evita apilar dos stickies con top calculado a mano, el punto frágil
// clásico de las tiras dobles). El bloque lleva bk-chrome-bg (void + grano, ver base.css) y -mt-4 pt-4 (cubre
// la banda del pt-4 del wrapper del shell al pegarse, ver CalendarView) —
// Admin con una tabla larga scrollea contra <main> con las tiras siempre
// visibles encima.
// (comentario aquí y no como primer hijo de <template>: un comentario ahí
// convierte la raíz en un fragmento de dos nodos y rompe wrapper.classes()
// en los tests, ver el mismo criterio en BkStepper.vue/TodayView.vue.)
</script>

<template>
  <div class="space-y-4">
    <!-- v0.9.0: tira sticky ÚNICA (el sub-selector de biblioteca murió, ver
         script) — a sangre completa (-mx-4 px-4: cruza el padding del
         wrapper hasta los bordes de la pantalla; sin esto el contenido
         scrolleado asomaba a su derecha, bug reportado por zurdi) -->
    <div class="sticky top-0 z-10 bk-chrome-bg -mt-4 -mx-4 px-4 pt-4 pb-1" data-testid="profile-tabs-sticky">
      <BkTabs v-model="activeTab" :tabs="tabs" />
    </div>

    <!-- bk-stagger en cada panel: v-if remonta el panel entero al cambiar de
         pestaña, y eso por sí solo repite la animación de entrada (item 4/7).
         El reset de scroll ya NO llega por el remount (el scroll vive en
         <main>): lo hace el watcher de activeTab/librarySection del script. -->
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

    <!-- v0.9.0: la biblioteca ES el catálogo de ejercicios; los grupos
         musculares (mantenimiento ocasional) viven en un sheet abierto por
         el botón de arriba — ver comentario del script. El manager de
         grupos se monta solo al abrir el sheet (v-if): carga fresca con su
         propio skeleton, y sus drawers internos de crear/editar apilan
         sobre este sheet vía layerStack (Escape cierra el de arriba). -->
    <div v-if="activeTab === 'library'" class="space-y-3 bk-stagger">
      <!-- v0.9.2 (zurdi): botón block de lado a lado, "Ver grupos musculares" -->
      <div :style="{ '--bk-stagger-i': 0 }">
        <BkButton
          variant="ghost"
          block
          data-testid="open-muscle-groups-btn"
          @click="groupsSheetOpen = true"
        >
          {{ $t('library.viewMuscleGroups') }}
        </BkButton>
      </div>
      <div :style="{ '--bk-stagger-i': 1 }"><ExerciseManager /></div>
      <!-- v0.9.2 (zurdi): sin card dentro del drawer — el título lo pone el
           drawer y el manager pinta lista + botón de nuevo grupo a pelo
           (frameless) -->
      <BkSheet :open="groupsSheetOpen" :title="$t('library.muscleGroups')" @close="groupsSheetOpen = false">
        <div v-if="groupsSheetOpen" class="p-4">
          <MuscleGroupManager frameless />
        </div>
      </BkSheet>
    </div>

    <Transition name="bk-rise" appear>
      <AdminCard v-if="activeTab === 'admin' && auth.user?.is_admin" />
    </Transition>
  </div>
</template>
