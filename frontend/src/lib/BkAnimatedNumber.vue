<script setup lang="ts">
import { useAnimatedNumber } from '@/composables/useAnimatedNumber'

// envoltorio mínimo para números animados DENTRO de un v-for: el composable
// necesita su propio scope (watch + onScopeDispose) por fila, algo que una
// función de formato inline en el padre no puede darle — una instancia de
// componente por fila (keyed) es la unidad de scope que Vue ya gestiona.
// Sin wrapper propio ni clases: reenvía el valor animado vía slot con ámbito.
const props = defineProps<{ value: number | null | undefined }>()

const display = useAnimatedNumber(() => props.value ?? null)
</script>

<template>
  <slot :value="display" />
</template>
