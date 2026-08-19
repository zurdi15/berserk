<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

// facelift v2 (zurdi: "algún tipo de confeti mágico") — ráfaga ÚNICA de
// chispas aurora/ember que suben desde la mitad baja de la pantalla y se
// apagan. CSS puro dentro del doctrine (bk-spark: transform/opacity, entrada
// única, cubierto por el guard universal de reduced-motion); el aleatorio
// vive en el setup (posición/deriva/duración por chispa vía CSS vars), no en
// el CSS. Overlay pointer-events-none en el techo del eje (z-timer), como
// NeonPulse. `done` desmonta al terminar la chispa más lenta.
const emit = defineEmits<{ done: [] }>()

const SPARK_COUNT = 26

type Spark = {
  left: string
  bottom: string
  size: string
  ember: boolean
  vars: Record<string, string>
}

const sparks: Spark[] = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const drift = (Math.random() - 0.5) * 30 // deriva lateral en vw
  const rise = 30 + Math.random() * 55 // subida en vh
  const duration = 900 + Math.random() * 900
  return {
    left: `${8 + Math.random() * 84}%`,
    bottom: `${5 + Math.random() * 30}%`,
    size: `${3 + Math.round(Math.random() * 3)}px`,
    // mayoría aurora con algún destello ember — el ember sigue siendo la
    // tinta de los logros, y terminar un entreno lo es
    ember: i % 5 === 0,
    vars: {
      '--bk-spark-dx': `${drift.toFixed(1)}vw`,
      '--bk-spark-dy': `-${rise.toFixed(1)}vh`,
      '--bk-spark-dur': `${Math.round(duration)}ms`,
      '--bk-spark-delay': `${Math.round(Math.random() * 350)}ms`,
    },
  }
})

let timer: ReturnType<typeof setTimeout> | null = null
onMounted(() => {
  // 900+900 de vuelo + 350 de delay máximo, con un colchón corto
  timer = setTimeout(() => emit('done'), 2400)
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-(--bk-z-timer) pointer-events-none" aria-hidden="true" data-testid="bk-sparks">
      <span
        v-for="(spark, i) in sparks"
        :key="i"
        class="bk-spark absolute rounded-full"
        :class="spark.ember ? 'bg-ember shadow-(--bk-shadow-ember)' : 'bg-aurora shadow-(--bk-shadow-aurora)'"
        :style="{ left: spark.left, bottom: spark.bottom, width: spark.size, height: spark.size, ...spark.vars }"
      />
    </div>
  </Teleport>
</template>
