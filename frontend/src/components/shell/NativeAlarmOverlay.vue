<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import BkButton from '@/lib/BkButton.vue'
import {
  ackNativeAlarm,
  getNativeAlarmState,
  isNativeShell,
  onNativeAlarm,
  type NativeAlarmState,
} from '@/utils/nativeShell'

// v0.35.0 (zurdi: "en vez de una pantalla específica para el crono terminado,
// un overlay en la pantalla del entreno con glow naranja"): mientras la shell
// vibra (BkAlarmService), esto cubre la app con un halo ámbar que respira, el
// nombre del ejercicio y el OK — sin "¡Tiempo!" ni ayudas. Se pinta por el
// evento alarmState y se re-pregunta al volver a primer plano (la alarma
// puede haber arrancado con la app muerta y ser ella quien la abrió). Si el
// OK llega por la notificación o por el reloj, el evento lo quita solo.
const { t } = useI18n()
const alarm = ref<NativeAlarmState | null>(null)
let unsubscribe: (() => void) | null = null

async function refresh() {
  if (!isNativeShell()) return
  const state = await getNativeAlarmState()
  alarm.value = state?.ringing ? state : null
}

function onVisibility() {
  if (document.visibilityState === 'visible') void refresh()
}

onMounted(() => {
  void refresh()
  unsubscribe = onNativeAlarm((state) => {
    alarm.value = state.ringing ? state : null
  })
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  unsubscribe?.()
  document.removeEventListener('visibilitychange', onVisibility)
})

// v0.35.1 (zurdi: "si solo pone el nombre del ejercicio lo veo soso; pon un
// 00:00 o 'descanso terminado'"): qué terminó, el 0:00 en grande y el ejercicio
const finishedLabel = computed(() => {
  if (alarm.value?.kind === 'cardio') return t('timer.cardioOver')
  if (alarm.value?.kind === 'rest') return t('timer.notifyTitle')
  return alarm.value?.title ?? ''
})

async function acknowledge() {
  alarm.value = null
  await ackNativeAlarm()
}
</script>

<template>
  <Transition name="bk-fade">
    <div
      v-if="alarm"
      class="bk-alarm-overlay fixed inset-0 z-(--bk-z-alarm) flex flex-col items-center justify-center gap-10 px-8"
      role="alertdialog"
      :aria-label="alarm.subtitle || alarm.title"
      data-testid="native-alarm-overlay"
    >
      <div class="bk-alarm-halo" aria-hidden="true" />
      <div class="relative flex flex-col items-center gap-3">
        <p class="font-display text-xs uppercase tracking-widest text-ink-muted" data-testid="native-alarm-label">
          {{ finishedLabel }}
        </p>
        <p class="bk-metric text-7xl text-ember tabular-nums bk-timer-done-pop" aria-hidden="true">0:00</p>
        <p class="bk-metric text-2xl text-ink text-center text-balance" data-testid="native-alarm-title">
          {{ alarm.subtitle || alarm.title }}
        </p>
      </div>
      <BkButton variant="ember" size="lg" class="relative min-w-44" data-testid="native-alarm-ok" @click="acknowledge">
        {{ t('timer.alarmOk') }}
      </BkButton>
    </div>
  </Transition>
</template>
