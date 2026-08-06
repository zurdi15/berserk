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
    <div
      v-if="show"
      class="fixed inset-0 z-(--bk-z-timer) pointer-events-none bk-neon-pulse"
      aria-hidden="true"
      data-testid="neon-pulse"
      @animationend="emit('done')"
    />
  </Teleport>
</template>
