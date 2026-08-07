<script setup lang="ts">
// primitiva única para botones de acción icon-only (editar/llave/borrar):
// antes cada consumidor (AdminCard, BodySection...) reinventaba su propio
// tamaño y estados hover — un único punto de verdad para el tamaño (w-8 h-8,
// icono ~w-4 h-4) y la paleta (danger para borrar, ink-muted para el resto).
//
// aria-label es obligatorio (icon-only: sin él el botón no tiene nombre
// accesible) pero NO se declara como prop de defineProps: el compilador de
// Vue excluye a propósito los atributos "aria-*" del emparejamiento
// kebab→camelCase con props (para no romper herramientas de accesibilidad
// que buscan el atributo DOM literal), así que un `:aria-label="x"` en el
// consumidor nunca llegaría a una prop `ariaLabel` — vue-tsc lo confirma en
// build. Se deja caer como atributo normal (fallthrough) sobre el único
// elemento raíz (el <button>), igual que ya hace BkButton; queda como
// contrato documentado aquí + cubierto por test, no por el tipo.
// v0.3.0 item 5: 'skip' y 'replan' se suman al catálogo — los botones de
// acción de una sesión programada (borrar/omitir/replanificar) pasan de
// texto a icon-only, mismo patrón que edit/key/delete de siempre.
// v0.3.2: 'copy' para el botón de copiar una plantilla de rutina
// (RoutineList) — dos cuadrados redondeados solapados, mismo trazo que el
// resto del set (nunca relleno).
defineProps<{
  icon: 'edit' | 'key' | 'delete' | 'skip' | 'replan' | 'copy'
}>()
</script>

<template>
  <button
    type="button"
    class="bk-press inline-flex items-center justify-center w-8 h-8 rounded-sm shrink-0"
    :class="
      icon === 'delete'
        ? 'text-danger hover:bg-danger/10'
        : 'text-ink-muted hover:text-ink'
    "
  >
    <svg
      v-if="icon === 'edit'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
    <svg
      v-else-if="icon === 'key'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-4 h-4"
      aria-hidden="true"
    >
      <!-- mismo icono de llave que ya usaba AdminCard: arco circular + eje dentado -->
      <circle cx="6" cy="12" r="3.5" />
      <path d="M9.5 12 L20 12 M15 12 L15 15 M19 12 L19 16" />
    </svg>
    <svg
      v-else-if="icon === 'delete'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M6 6 L18 18 M18 6 L6 18" />
    </svg>
    <svg
      v-else-if="icon === 'skip'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-4 h-4"
      aria-hidden="true"
    >
      <!-- círculo tachado: distinto de la X de "delete" (una sola diagonal,
           no dos cruzadas) — "esto no va a pasar", no "esto se destruye" -->
      <circle cx="12" cy="12" r="9" />
      <path d="M6 6 L18 18" />
    </svg>
    <svg
      v-else-if="icon === 'replan'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-4 h-4"
      aria-hidden="true"
    >
      <!-- replan: flecha circular (rotate-ccw) — un arco + una sola cabeza
           de flecha, no el doble-arco de un "refresh" completo -->
      <path d="M1 4v6h6" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
    <svg
      v-else
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-4 h-4"
      aria-hidden="true"
    >
      <!-- copy (v0.3.2): dos cuadrados redondeados solapados — el de detrás
           (la plantilla original) y el de delante (la copia que se crea) -->
      <rect x="4" y="4" width="11" height="11" rx="2" />
      <rect x="9" y="9" width="11" height="11" rx="2" />
    </svg>
  </button>
</template>
