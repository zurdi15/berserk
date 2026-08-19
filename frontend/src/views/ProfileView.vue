<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { listWorkouts } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { getMondayOfWeek, todayIso } from '@/utils/dates'
import { useTabHash } from '@/composables/useTabHash'
import { resetMainScroll } from '@/composables/useMainScroll'
import BkListRow from '@/lib/BkListRow.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkButton from '@/lib/BkButton.vue'
import type { RuneName } from '@/lib/runes'
import SettingsCard from '@/components/profile/SettingsCard.vue'
import PasswordCard from '@/components/profile/PasswordCard.vue'
import SharingCard from '@/components/profile/SharingCard.vue'
import AdminCard from '@/components/profile/AdminCard.vue'
import RoutineList from '@/components/routines/RoutineList.vue'
import ExerciseManager from '@/components/library/ExerciseManager.vue'
import MuscleGroupManager from '@/components/library/MuscleGroupManager.vue'
import { useAuthStore } from '@/stores/auth'

// facelift: Perfil pasa de 4 pestañas a un HUB de listas (la referencia) —
// cabecera de identidad + actividad semanal + una fila por sección. El hash
// sigue siendo la fuente de verdad (useTabHash): #routines/#library/#admin
// de enlaces viejos siguen aterrizando en su sección; el hub es el estado
// por defecto (#profile) y cada sección se abre a pantalla con fila "‹
// Perfil" de vuelta. Ajustes y Compartir (antes apiladas dentro de la
// pestaña Perfil) son ahora secciones propias.
type ProfileTab = 'profile' | 'settings' | 'routines' | 'library' | 'sharing' | 'admin'

const { t, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()

// item 1 (v0.3.2): #admin no es válido para un no-admin — cae al default
// (ver useTabHash), aunque llegue por hash de un enlace viejo/compartido
function validProfileTabs(): ProfileTab[] {
  const base: ProfileTab[] = ['profile', 'settings', 'routines', 'library', 'sharing']
  return auth.user?.is_admin ? [...base, 'admin'] : base
}

const activeTab = useTabHash<ProfileTab>('profile', validProfileTabs)

// v0.9.0 (zurdi: "no me convence en biblioteca el layout de doble tab"):
// muere el sub-selector Ejercicios/Grupos — la biblioteca ES el catálogo de
// ejercicios, y los grupos musculares (mantenimiento ocasional) se gestionan
// desde un sheet abierto por un botón.
const groupsSheetOpen = ref(false)

// v0.5.0 (modelo de scroll único): cambiar de sección (hash, no path: el
// reset de ShellView no lo ve) debe resetear el scroll de <main> explícito
watch(activeTab, () => {
  resetMainScroll()
})

// facelift: filas del hub — icono rúnico + etiqueta + chevron
const hubRows = computed(() => {
  const rows: { tab: ProfileTab; label: string; rune: RuneName }[] = [
    { tab: 'settings', label: t('profile.settingsTab'), rune: 'dagaz' },
    { tab: 'routines', label: t('profile.routinesTab'), rune: 'raidho' },
    { tab: 'library', label: t('profile.libraryTab'), rune: 'kenaz' },
    { tab: 'sharing', label: t('profile.sharingTab'), rune: 'gebo' },
  ]
  if (auth.user?.is_admin) rows.push({ tab: 'admin', label: t('profile.adminTab'), rune: 'tiwaz' })
  return rows
})

// facelift: "Tu actividad reciente" — 7 puntos de la semana (mismo idiom que
// WeekSummaryCard en Hoy; duplicación pequeña y asumida, el fetch es propio)
const weekWorkoutDates = ref<Set<string>>(new Set())
const weekReady = ref(false)

async function loadWeek() {
  try {
    const workouts = await listWorkouts({ from_date: getMondayOfWeek(), to_date: todayIso() })
    weekWorkoutDates.value = new Set(workouts.map((w) => w.date))
  } catch {
    // hint de fondo: sin red, el hub sigue sin los puntos
  } finally {
    weekReady.value = true
  }
}
void loadWeek()

const weekDots = computed(() => {
  const monday = getMondayOfWeek()
  const [y, m, d] = monday.split('-').map(Number)
  const today = todayIso()
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(y, m - 1, d + i)
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return {
      iso,
      label: new Intl.DateTimeFormat(locale.value, { weekday: 'narrow' }).format(date),
      trained: weekWorkoutDates.value.has(iso),
      future: iso > today,
      isToday: iso === today,
    }
  })
})

const initial = computed(() => (auth.user?.username?.[0] ?? '?').toUpperCase())

function openSection(tab: ProfileTab) {
  activeTab.value = tab
}

function backToHub() {
  activeTab.value = 'profile'
}

const sectionTitle = computed(() => {
  const labels: Record<ProfileTab, string> = {
    profile: t('profile.tab'),
    settings: t('profile.settingsTab'),
    routines: t('profile.routinesTab'),
    library: t('profile.libraryTab'),
    sharing: t('profile.sharingTab'),
    admin: t('profile.adminTab'),
  }
  return labels[activeTab.value]
})

async function handleLogout() {
  try {
    await auth.logout()
    router.push({ name: 'login' })
  } catch (error) {
    toastApiError(error)
  }
}

// v0.5.0 (modelo de scroll único, ver ShellView.vue): la raíz FLUYE. La
// tira sticky de pestañas murió con el hub — la única "chrome" es la fila
// de vuelta de las secciones, que no necesita sticky (las secciones abren
// con el scroll reseteado).
// (comentario aquí y no como primer hijo de <template>: un comentario ahí
// convierte la raíz en un fragmento de dos nodos y rompe wrapper.classes()
// en los tests, ver el mismo criterio en BkStepper.vue/TodayView.vue.)
</script>

<template>
  <div class="space-y-4">
    <!-- HUB (estado por defecto) -->
    <div v-if="activeTab === 'profile'" class="space-y-4 bk-stagger">
      <!-- cabecera de identidad: avatar con anillo del color de usuario
           (dato, no token — style inline como BkUser) + nombre grande -->
      <div class="flex flex-col items-center gap-2 pt-2" :style="{ '--bk-stagger-i': 0 }" data-testid="profile-identity">
        <span
          class="flex items-center justify-center w-18 h-18 rounded-full bg-slab border-2 font-display font-bold text-3xl text-ink"
          :style="{ borderColor: auth.user?.color || 'var(--bk-accent-aurora)' }"
          aria-hidden="true"
        >{{ initial }}</span>
        <h1 class="bk-title text-ink">{{ auth.user?.username }}</h1>
        <button
          type="button"
          class="bk-press text-sm text-aurora underline decoration-dotted"
          data-testid="profile-edit-link"
          @click="openSection('settings')"
        >
          {{ t('profile.editProfile') }}
        </button>
      </div>

      <!-- actividad reciente: 7 puntos de la semana -->
      <section v-if="weekReady" class="bk-slab p-5" :style="{ '--bk-stagger-i': 1 }" data-testid="profile-activity">
        <h2 class="bk-title text-ink mb-4">{{ t('profile.activity') }}</h2>
        <div class="flex justify-between gap-1" :aria-label="t('today.weekDots')">
          <div v-for="dot in weekDots" :key="dot.iso" class="flex flex-col items-center gap-1.5 flex-1">
            <span class="text-2xs uppercase" :class="dot.isToday ? 'text-ink font-semibold' : 'text-ink-faint'">{{ dot.label }}</span>
            <span
              class="w-2.5 h-2.5 rounded-full"
              :class="dot.trained ? 'bg-aurora' : dot.future ? 'bg-line/50' : 'bg-line-strong'"
            />
          </div>
        </div>
      </section>

      <!-- filas de sección -->
      <div class="space-y-2" :style="{ '--bk-stagger-i': 2 }">
        <BkListRow
          v-for="row in hubRows"
          :key="row.tab"
          :label="row.label"
          :rune="row.rune"
          chevron
          :data-testid="`profile-link-${row.tab}`"
          @click="openSection(row.tab)"
        />
      </div>

      <!-- item 12: fila completa, danger — cerrar sesión es la acción más
           "destructiva" visible del perfil, se trata como tal -->
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

    <!-- SECCIONES: fila de vuelta + contenido -->
    <template v-else>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="bk-press flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
          data-testid="profile-back"
          @click="backToHub"
        >
          <span aria-hidden="true">‹</span> {{ t('profile.tab') }}
        </button>
        <h1 class="bk-title text-ink flex-1 text-center pr-12">{{ sectionTitle }}</h1>
      </div>

      <div v-if="activeTab === 'settings'" class="space-y-4 bk-stagger">
        <div :style="{ '--bk-stagger-i': 0 }"><SettingsCard /></div>
        <div :style="{ '--bk-stagger-i': 1 }"><PasswordCard /></div>
      </div>

      <!-- un único hijo: bk-rise en vez de bk-stagger (nada que escalonar) -->
      <Transition name="bk-rise" appear>
        <RoutineList v-if="activeTab === 'routines'" />
      </Transition>

      <!-- v0.9.0: la biblioteca ES el catálogo de ejercicios; los grupos
           musculares (mantenimiento ocasional) viven en un sheet abierto por
           el botón de arriba. El manager de grupos se monta solo al abrir el
           sheet (v-if): carga fresca con su propio skeleton, y sus drawers
           internos apilan sobre este sheet vía layerStack. -->
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
        <BkSheet :open="groupsSheetOpen" :title="$t('library.muscleGroups')" @close="groupsSheetOpen = false">
          <div v-if="groupsSheetOpen" class="p-4">
            <MuscleGroupManager frameless />
          </div>
        </BkSheet>
      </div>

      <Transition name="bk-rise" appear>
        <SharingCard v-if="activeTab === 'sharing'" />
      </Transition>

      <Transition name="bk-rise" appear>
        <AdminCard v-if="activeTab === 'admin' && auth.user?.is_admin" />
      </Transition>
    </template>
  </div>
</template>
