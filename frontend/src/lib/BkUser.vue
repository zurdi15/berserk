<script setup lang="ts">
// v0.4.0: primitiva única para "un usuario" en cualquier listado (compartido
// con/por de SharingCard, filas de AdminCard…) — antes cada consumidor
// reinventaba su propio punto de color (ver SharingCard antes de esta
// primitiva). El color es DATO de usuario (user.color, elegido en Ajustes),
// no un token del sistema de diseño — igual que el resto de "datos de
// usuario" en la app (colores de gráficas, dots de calendario): vive como
// style inline con un fallback aurora, exento a propósito del guard de hex
// crudo (ese guard mira clases, no atributos style).
withDefaults(
  defineProps<{
    user: { username: string; color?: string | null }
    size?: 'sm' | 'md'
  }>(),
  { size: 'md' },
)
</script>

<template>
  <span class="inline-flex items-center gap-2 min-w-0" data-testid="bk-user">
    <span
      class="rounded-full shrink-0"
      :class="size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'"
      :style="{ backgroundColor: user.color || 'var(--bk-accent-aurora)' }"
      data-testid="bk-user-dot"
      aria-hidden="true"
    />
    <span class="truncate" :class="size === 'sm' ? 'text-xs' : 'text-sm'">{{ user.username }}</span>
  </span>
</template>
