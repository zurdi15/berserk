// Única fuente de verdad del diseño: cualquier color/duración/curva nuevos
// nacen aquí y llegan al CSS vía `npm run build:tokens`, nunca a mano.

export const themes = {
  dark: {
    'bg-void': '#0A0C0F',
    'bg-stone': '#12151A',
    'bg-slab': '#1A1E25',
    line: '#262B33',
    'line-strong': '#333A44',
    ink: '#E8EDF2',
    'ink-muted': '#9AA4B2',
    'ink-faint': '#5C6672',
    'accent-aurora': '#4FD8C4',
    'accent-aurora-deep': '#2BA893',
    'accent-ember': '#FF8A3D',
    'accent-ember-deep': '#E8734A',
    danger: '#E5604F',
    'aurora-glow': 'rgba(79, 216, 196, 0.25)',
    'ember-glow': 'rgba(255, 138, 61, 0.30)',
    // equivalentes exactos de lo que BkSheet.vue / base.css ya pintaban a
    // mano antes de v0.4.0 (bg-void/70 y el inset hardcodeado de .bk-slab) —
    // tokenizados aquí para que el tema claro pueda redefinirlos sin tocar
    // ningún componente. Ver el why-comment largo en el bloque `light` de
    // abajo: ahí es donde estos tres SÍ necesitan una fórmula distinta.
    scrim: 'rgba(10, 12, 15, 0.7)',
    'slab-shadow': 'inset 0 1px 0 var(--bk-line)',
    'noise-opacity': '0.035',
  },
  // nordic DAY: niebla pálida sobre nieve, NUNCA crema cálido — el void/stone/
  // slab reproducen a propósito la MISMA proporción de contraste entre sí que
  // sus gemelos oscuros (ratios ~1.07/1.09/1.17, ver la verificación de
  // contraste hecha al diseñar esta paleta), así que la jerarquía de
  // superficies se "siente" igual en los dos temas aunque los números cambien.
  // aurora/ember originales (heredados del scaffold de fase 3, #1F9C8A y
  // #D97A2E) solo llegaban a 3.40:1 y 3.10:1 sobre bg-stone — por debajo del
  // 4.5:1 de WCAG AA para texto normal, y SÍ se usan como texto (badges de PR,
  // warm-up, feeling, etc.), no solo como acento decorativo. Se oscurecieron
  // manteniendo el mismo matiz/saturación (HSL, girando solo L) hasta cruzar
  // el umbral con margen: aurora 5.00:1, ember 5.02:1. Las variantes *-deep
  // se separaron más aún (7.0:1) para que sigan leyéndose como un paso más
  // oscuro y no un match casi idéntico al tono base ya oscurecido.
  light: {
    'bg-void': '#F2F4F6',
    'bg-stone': '#FFFFFF',
    'bg-slab': '#E9ECEF',
    line: '#D5DAE0',
    'line-strong': '#B9C0C9',
    ink: '#1A2028',
    'ink-muted': '#5A6472',
    'ink-faint': '#8B95A1',
    'accent-aurora': '#197D6E',
    'accent-aurora-deep': '#146459',
    'accent-ember': '#A85B1E',
    'accent-ember-deep': '#874918',
    danger: '#C74436',
    // mismo rgb que el aurora/ember ya oscurecidos de arriba (una brillante
    // de 0.20/0.25 se perdía sobre blanco: bg claro absorbe mucho menos el
    // halo que uno oscuro, así que sube un poco la opacidad para que el
    // glow de foco/logro siga siendo visible)
    'aurora-glow': 'rgba(25, 125, 110, 0.28)',
    'ember-glow': 'rgba(168, 91, 30, 0.32)',
    // v0.4.0 LIGHT THEME — dos tokens nuevos, no-color, que SÍ necesitan
    // variar por tema (no encajan en `core`, que es tema-agnóstico):
    //
    // scrim: BkSheet.vue pintaba su fondo de cajón con bg-void/70 — en
    // oscuro el void ES casi negro, así que "atenuar con el propio fondo"
    // colaba, pero en claro el void es niebla pálida: un scrim que aclara en
    // vez de atenuar. Un scrim SIEMPRE debe ser oscuro, sea cual sea el
    // tema (mismo criterio que Material Design). Se reutiliza el ink propio
    // de este tema (pizarra oscura #1A2028) en vez de negro puro, para que
    // el atenuado quede dentro de la misma familia de color fría en vez de
    // un negro genérico ajeno a la paleta.
    scrim: 'rgba(26, 32, 40, 0.45)',
    // slab-shadow: .bk-slab tallaba su "brillo interior" con
    // `inset 0 1px 0 var(--bk-line)` — en oscuro, line es más CLARO que la
    // superficie (bg-stone), así que ese inset lee como un filo iluminado
    // desde arriba. En claro, line es más OSCURO que bg-stone (blanco): el
    // mismo inset leería como una hendidura, no un realce, y encima una losa
    // blanca sobre niebla pálida necesita separación real (elevación), no
    // solo un borde. Fórmula propia para claro: sombra de contacto suave
    // hacia abajo (elevación, "papel/hielo levantado") + inset blanco arriba
    // (capta la luz desde encima, mismo lenguaje que "hielo" del brief).
    'slab-shadow': '0 1px 3px rgba(20, 26, 35, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
    // noise-opacity: el ruido SVG de body::before es turbulencia de escala de
    // grises de bajo contraste — sobre negro casi no se ve (0.035 va bien),
    // pero la MISMA opacidad sobre blanco puro se lee como suciedad/grano de
    // impresión barata en vez de niebla sutil (probado visualmente, ver
    // capturas). Se baja para claro.
    'noise-opacity': '0.02',
  },
} as const

export const core = {
  radius: { xs: '2px', sm: '6px', md: '10px', full: '9999px' },
  font: {
    display: "'Chakra Petch', system-ui, sans-serif",
    body: "'Inter Variable', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  },
  dur: { 1: '120ms', 2: '200ms', 3: '320ms', 4: '600ms', 5: '1200ms' },
  ease: {
    out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.4, 0.44, 1)',
    carve: 'cubic-bezier(0.7, 0, 0.2, 1)',
    inout: 'cubic-bezier(0.45, 0, 0.55, 1)',
    linear: 'linear',
  },
  z: { nav: '40', sheet: '50', toast: '60', timer: '70' },
  shadow: {
    aurora: '0 0 20px var(--bk-aurora-glow)',
    ember: '0 0 24px var(--bk-ember-glow)',
  },
} as const
