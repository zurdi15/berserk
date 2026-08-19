<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { StatsOut } from '@/api/domain'
import { useDisplayUnits } from '@/composables/useDisplayUnits'
import BkAnimatedNumber from '@/lib/BkAnimatedNumber.vue'
import BkCard from '@/lib/BkCard.vue'
import { formatWeightInt } from '@/utils/units'

// null mientras el padre no ha resuelto el fetch (item de round 8): el padre
// gatea el montaje entero con v-if="statsReady", así que aquí solo hace
// falta el fallback a 0 para el primer tick antes de que llegue el prop real
const props = defineProps<{ stats: StatsOut | null }>()

const { t } = useI18n()
const units = useDisplayUnits()

// horas enteras (zurdi: "127 h", nada de desglose de minutos/segundos) — el
// redondeo va ANTES de entrar en useAnimatedNumber (dentro de BkAnimatedNumber):
// el frame final del tween pinta el `to` exacto sin pasar por `decimals`
// (ver composables/useAnimatedNumber.ts), así que si no se redondea aquí el
// valor final mostraría decimales sueltos de segundos/3600
const gymHours = computed(() => Math.round((props.stats?.total_gym_seconds ?? 0) / 3600))
const cardioHours = computed(() => Math.round((props.stats?.total_cardio_seconds ?? 0) / 3600))

// km con 1 decimal, mismo motivo que las horas: se redondea a 1 decimal antes
// del tween para que el frame final ya venga con la precisión correcta
const distanceKm = computed(() => Math.round((props.stats?.total_distance_m ?? 0) / 100) / 10)

// sesión media: misma pareja h/min que FinishSummary.durationLabel (es una
// duración de la misma magnitud que la de un entreno, no un total de por
// vida) — a diferencia de gymTime/cardioTime, que son sumas de meses/años y
// sí caben en horas enteras sin perder información útil. Se rondea a minutos
// ANTES del tween (mismo motivo que gymHours/cardioHours) y se anima ese
// total de minutos; el h/min se deriva del valor YA animado en el slot.
const avgMinutesTotal = computed(() => Math.round((props.stats?.avg_session_seconds ?? 0) / 60))

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}
</script>

<template>
  <div class="grid grid-cols-2 gap-3" data-testid="stats-grid">
    <!-- v0.5.0 (modelo de scroll único): grid puro que fluye contra <main> —
         el flex-1/min-h-0/overflow del modelo viejo se retiró con la cadena
         de alturas. (comentario DENTRO de la raíz: como primer hijo del
         template crearía un fragmento de dos raíces y rompería
         wrapper.classes() en los tests, ver el comentario equivalente en
         ProgressView.vue) -->
    <BkCard>
      <p class="text-ink-muted text-sm">{{ t('progress.stats.workouts') }}</p>
      <BkAnimatedNumber :value="stats?.total_workouts ?? 0" v-slot="{ value }">
        <p class="bk-metric text-3xl text-ink" data-testid="stat-workouts">{{ value ?? 0 }}</p>
      </BkAnimatedNumber>
    </BkCard>

    <BkCard>
      <p class="text-ink-muted text-sm">{{ t('progress.stats.gymTime') }}</p>
      <BkAnimatedNumber :value="gymHours" v-slot="{ value }">
        <p class="bk-metric text-3xl text-ink" data-testid="stat-gym-time">{{ value ?? 0 }} h</p>
      </BkAnimatedNumber>
    </BkCard>

    <BkCard>
      <p class="text-ink-muted text-sm">{{ t('progress.stats.cardioTime') }}</p>
      <BkAnimatedNumber :value="cardioHours" v-slot="{ value }">
        <p class="bk-metric text-3xl text-ink" data-testid="stat-cardio-time">{{ value ?? 0 }} h</p>
      </BkAnimatedNumber>
    </BkCard>

    <BkCard>
      <p class="text-ink-muted text-sm">{{ t('progress.stats.distance') }}</p>
      <BkAnimatedNumber :value="distanceKm" :decimals="1" v-slot="{ value }">
        <p class="bk-metric text-3xl text-ink" data-testid="stat-distance">{{ (value ?? 0).toFixed(1) }} km</p>
      </BkAnimatedNumber>
    </BkCard>

    <BkCard>
      <!-- STATS-CLARITY: total_volume_kg suma reps×peso de series efectivas
           (sin calentamiento, ver effective_set_filters en services/progress.py)
           — el label ya dice "levantado" y el title expande el cálculo exacto,
           el kg ya lo pone formatWeightInt en el número -->
      <p class="text-ink-muted text-sm" data-testid="stat-volume-label" :title="t('progress.stats.volumeTitle')">
        {{ t('progress.stats.volume') }}
      </p>
      <BkAnimatedNumber :value="stats?.total_volume_kg ?? 0" v-slot="{ value }">
        <p class="bk-metric text-3xl text-ink" data-testid="stat-volume">{{ formatWeightInt(value ?? 0, units) }}</p>
      </BkAnimatedNumber>
    </BkCard>

    <BkCard>
      <!-- STATS-CLARITY: total_sets excluye calentamiento (WorkoutSet.is_warmup
           is False en lifetime_stats) — no obvio sin leer el backend -->
      <p class="text-ink-muted text-sm" data-testid="stat-sets-label" :title="t('progress.stats.setsTitle')">
        {{ t('progress.stats.sets') }}
      </p>
      <BkAnimatedNumber :value="stats?.total_sets ?? 0" v-slot="{ value }">
        <p class="bk-metric text-3xl text-ink" data-testid="stat-sets">{{ value ?? 0 }}</p>
      </BkAnimatedNumber>
    </BkCard>

    <BkCard>
      <p class="text-ink-muted text-sm">{{ t('progress.stats.reps') }}</p>
      <BkAnimatedNumber :value="stats?.total_reps ?? 0" v-slot="{ value }">
        <p class="bk-metric text-3xl text-ink" data-testid="stat-reps">{{ value ?? 0 }}</p>
      </BkAnimatedNumber>
    </BkCard>

    <BkCard>
      <!-- STATS-CLARITY: "PRs" es abreviatura — title expande a "Récords
           personales" sin alargar el label visible de la tarjeta -->
      <p class="text-ink-muted text-sm" data-testid="stat-prs-label" :title="t('progress.stats.prsTitle')">
        {{ t('progress.stats.prs') }}
      </p>
      <BkAnimatedNumber :value="stats?.prs_count ?? 0" v-slot="{ value }">
        <p class="bk-metric text-2xl text-ember" data-testid="stat-prs">{{ value ?? 0 }}</p>
      </BkAnimatedNumber>
    </BkCard>

    <BkCard>
      <p class="text-ink-muted text-sm">{{ t('progress.stats.avgSession') }}</p>
      <BkAnimatedNumber :value="avgMinutesTotal" v-slot="{ value }">
        <p class="bk-metric text-3xl text-ink" data-testid="stat-avg-session">{{ formatMinutes(value ?? 0) }}</p>
      </BkAnimatedNumber>
    </BkCard>

    <BkCard>
      <!-- STATS-CLARITY: longest_streak_weeks es la racha más larga de TODA
           la historia (no la vigente, esa vive en /progress/streak) y son
           semanas, no días — el número solo ("6") se leía como días -->
      <p class="text-ink-muted text-sm" data-testid="stat-streak-label" :title="t('progress.stats.streakTitle')">
        {{ t('progress.stats.streak') }}
      </p>
      <BkAnimatedNumber :value="stats?.longest_streak_weeks ?? 0" v-slot="{ value }">
        <p class="bk-metric text-3xl text-ink" data-testid="stat-streak">{{ value ?? 0 }} {{ t('progress.stats.streakUnit') }}</p>
      </BkAnimatedNumber>
    </BkCard>
  </div>
</template>
