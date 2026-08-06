<script setup lang="ts">
// item 9: pulso aurora en los bordes de pantalla al registrar una serie con
// éxito. `show` lo controla el padre (WorkoutView/WorkoutEditView) desde el
// submit exitoso del drawer; `done` avisa cuando la animación CSS termina
// para que el padre limpie el estado y un segundo pulso pueda volver a
// disparar (una animación ya-en-curso no reinicia sola con el mismo v-if).
defineProps<{ show: boolean }>()
const emit = defineEmits<{ done: [] }>()
</script>

<template>
  <Teleport to="body">
    <!-- M10b (revisión), verificado a propósito: z-(--bk-z-timer)=70, por
         ENCIMA del drawer (--bk-z-sheet=50) y de los toasts (--bk-z-toast=60)
         — intencional, no un descuido. "Registrar y otra" deja el cajón
         ABIERTO mientras el pulso dispara, así que tiene que pintarse por
         encima para que se vea; al ser solo un box-shadow INSET
         pointer-events-none (sin fondo sólido, sin bloquear nada), no tapa
         el contenido del cajón ni la lectura de un toast en curso — mismo
         z-index que BkCelebration (nunca compiten a la vez: la celebración
         de PR siempre gana, ver WorkoutView.vue::onLogged) -->
    <div
      v-if="show"
      class="fixed inset-0 z-(--bk-z-timer) pointer-events-none bk-neon-pulse"
      aria-hidden="true"
      data-testid="neon-pulse"
      @animationend="emit('done')"
    />
  </Teleport>
</template>
