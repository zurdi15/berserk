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
    // facelift: glow de baja intensidad para superficies GRANDES (hero rúnico,
    // check de serie marcada) — el aurora-glow de 0.25 está calibrado para
    // halos pequeños (CTA del nav); a tamaño hero satura y deslumbra.
    'aurora-glow-soft': 'rgba(79, 216, 196, 0.12)',
    // facelift: sombra de elevación para paneles flotantes (BkSelect/BkDate/
    // BkTime/BkTooltip) — antes usaban el shadow-lg crudo de Tailwind, la
    // única sombra de la app fuera de tokens. Dos capas (contacto + ambiente)
    // para que flote de verdad sobre el void casi negro.
    'shadow-float': '0 4px 10px rgba(0, 0, 0, 0.35), 0 12px 32px rgba(0, 0, 0, 0.45)',
    // equivalentes exactos de lo que BkSheet.vue / base.css ya pintaban a
    // mano antes de v0.4.0 (bg-void/70 y el inset hardcodeado de .bk-slab) —
    // tokenizados aquí para que el tema claro pueda redefinirlos sin tocar
    // ningún componente. Ver el why-comment largo en el bloque `light` de
    // abajo: ahí es donde estos tres SÍ necesitan una fórmula distinta.
    scrim: 'rgba(10, 12, 15, 0.7)',
    // facelift: la talla (inset con line) se conserva — es la seña "losa" —
    // pero la card grande y redondeada del rediseño necesita además una
    // sombra ambiente suave para despegarse del void; sin ella, a 24px de
    // radio la superficie lee como un parche plano, no como una card.
    'slab-shadow': 'inset 0 1px 0 var(--bk-line), 0 2px 10px rgba(0, 0, 0, 0.25)',
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
    // mismo criterio que sus gemelos oscuros; rgb del aurora claro (ya
    // oscurecido para AA) y opacidad un punto arriba, como aurora-glow
    'aurora-glow-soft': 'rgba(25, 125, 110, 0.14)',
    // elevación sobre niebla pálida: sombras frías de la familia ink
    // (20,26,35 = el mismo rgb que ya usa slab-shadow claro), mucho más
    // tenues que en oscuro porque el fondo absorbe menos
    'shadow-float': '0 4px 10px rgba(20, 26, 35, 0.08), 0 12px 32px rgba(20, 26, 35, 0.14)',
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
    // facelift: blur 3→10 en paralelo a la ambiente nueva del tema oscuro —
    // la card de 24px pide una elevación algo más generosa en los dos temas.
    'slab-shadow': '0 2px 10px rgba(20, 26, 35, 0.07), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
    // noise-opacity: el ruido SVG de body::before es turbulencia de escala de
    // grises de bajo contraste — sobre negro casi no se ve (0.035 va bien),
    // pero la MISMA opacidad sobre blanco puro se lee como suciedad/grano de
    // impresión barata en vez de niebla sutil (probado visualmente, ver
    // capturas). Se baja para claro.
    'noise-opacity': '0.02',
  },
} as const

export const core = {
  // facelift (rediseño "amable"): la escala entera sube un escalón — la app
  // pasaba de losa afilada (6px en el 90% de superficies) a card redondeada.
  // sm sigue siendo el radio de controles inline (los 91 rounded-sm existentes
  // se suavizan solos, sin tocar templates), md es el "squircle" de controles
  // táctiles (stepper, check, thumbs), lg es la card (.bk-slab) y xl la
  // esquina superior de BkSheet / heros a sangre.
  radius: { xs: '4px', sm: '10px', md: '16px', lg: '24px', xl: '28px', full: '9999px' },
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
  // noise: la capa de niebla global (body::before) vive POR ENCIMA de todo,
  // siempre — v0.9.2 (bug real de zurdi: "la animación de entrada y después
  // las cards se pintan con otro color"): una animación de opacity/transform
  // convierte al elemento en stacking context y lo pintaba ENCIMA de la
  // niebla mientras animaba; al terminar volvía a pintarse debajo — ese
  // salto de grano era el "cambio de color". Con la niebla en el techo del
  // eje z (pointer-events none, 2% de opacidad) la relación es CONSTANTE
  // durante y después de cualquier animación, para todo (cards, sheets,
  // toasts) — y bk-chrome-bg dejó de necesitar su réplica del grano.
  // v0.35.0: alarm = overlay de la alarma de fin (shell): sobre toasts y timer, bajo el grano
  z: { nav: '40', sheet: '50', toast: '60', timer: '70', alarm: '80', noise: '90' },
  shadow: {
    aurora: '0 0 20px var(--bk-aurora-glow)',
    ember: '0 0 24px var(--bk-ember-glow)',
    // facelift: halo grande y tenue para superficies amplias (hero rúnico sin
    // foto, BkCheck marcado) — radio mayor + el glow-soft de baja opacidad
    'aurora-soft': '0 0 32px var(--bk-aurora-glow-soft)',
  },
} as const
