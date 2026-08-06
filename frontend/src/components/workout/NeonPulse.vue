<script setup lang="ts">
// item 2 (ola de pulido v0.3.0): dos estelas aurora recorriendo los bordes
// de pantalla en sentidos opuestos, que se cruzan arriba, al registrar una
// serie con éxito — reemplaza el flash de borde estático de antes (un solo
// nodo con box-shadow parpadeante). `show` lo controla el padre
// (WorkoutView/WorkoutEditView) desde el submit exitoso del drawer; `done`
// avisa cuando la coreografía CSS termina para que el padre limpie el
// estado y un segundo pulso pueda volver a disparar (una animación
// ya-en-curso no reinicia sola con el mismo v-if).
defineProps<{ show: boolean }>()
const emit = defineEmits<{ done: [] }>()

// las CUATRO barras (dos laterales + dos superiores, ver animations.css)
// están cronometradas para terminar A LA VEZ — top-a y top-b comparten
// duración/retardo por diseño — así que basta con escuchar el animationend
// de UNA (top-a) para saber que la coreografía completa terminó; escuchar
// las cuatro emitiría 'done' varias veces por el mismo ciclo.
</script>

<template>
  <Teleport to="body">
    <!-- M10b (revisión), verificado a propósito: z-(--bk-z-timer)=70, por
         ENCIMA del drawer (--bk-z-sheet=50) y de los toasts (--bk-z-toast=60)
         — intencional, no un descuido. "Registrar y otra" deja el cajón
         ABIERTO mientras el pulso dispara, así que tiene que pintarse por
         encima para que se vea; al ser barras finas pointer-events-none
         (sin fondo sólido, sin bloquear nada), no tapan el contenido del
         cajón ni la lectura de un toast en curso — mismo z-index que
         BkCelebration (nunca compiten a la vez: la celebración de PR
         siempre gana, ver WorkoutView.vue::onLogged) -->
    <div
      v-if="show"
      class="fixed inset-0 z-(--bk-z-timer) pointer-events-none"
      aria-hidden="true"
      data-testid="neon-pulse"
    >
      <span class="bk-neon-streak bk-neon-edge-left" data-testid="neon-pulse-left" />
      <span class="bk-neon-streak bk-neon-edge-right" data-testid="neon-pulse-right" />
      <span
        class="bk-neon-streak bk-neon-edge-top-a"
        data-testid="neon-pulse-top-a"
        @animationend="emit('done')"
      />
      <span class="bk-neon-streak bk-neon-edge-top-b" data-testid="neon-pulse-top-b" />
    </div>
  </Teleport>
</template>
