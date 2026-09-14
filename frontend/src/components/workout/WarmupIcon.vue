<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import BkRune from '@/lib/BkRune.vue'

// v0.40.1 (zurdi: "el chip de calentamiento cámbialo por un icono más
// limpio, quizá una llamita... que entone con la estética de la app"): la
// fila de calentamiento se marca con la runa `flame` de la casa (trazos
// rectos en rejilla 32×32, cap cuadrado, tono ember) en vez de texto —
// mismo lenguaje que las runas de grupo muscular de la propia card. El
// nombre accesible sigue siendo el literal de siempre (BkRune va
// aria-hidden; el rol lo lleva el contenedor).
const { t } = useI18n()
</script>

<template>
  <span class="inline-flex shrink-0" role="img" :aria-label="t('workout.warmup')">
    <BkRune name="flame" tone="ember" :size="14" />
  </span>
</template>
