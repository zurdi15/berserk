<script setup lang="ts">
import { onMounted, ref } from 'vue'

const apiOk = ref(false)

onMounted(async () => {
  const resp = await fetch('/api/v1/health')
  apiOk.value = resp.ok
})
</script>

<template>
  <main class="placeholder">
    <h1>ᛒ berserk</h1>
    <p>{{ apiOk ? 'API conectada' : 'API no disponible' }}</p>
  </main>
</template>

<style>
/* placeholder de fase 1: los tokens y el design system llegan en fase 3 */
.placeholder {
  min-height: 100dvh;
  display: grid;
  place-content: center;
  text-align: center;
  background: #0b0d10;
  color: #e6edf3;
  font-family: system-ui, sans-serif;
}
</style>
