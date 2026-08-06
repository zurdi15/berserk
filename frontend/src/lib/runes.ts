// Runas geométricas propias sobre rejilla 32×32 (marcas de la casa, no
// futhark canónico): trazos rectos para que el "tallado" (dashoffset) luzca.
// Excepto berserk, que es el bindrune del berserker (lanza + aspa astada + rombo),
// calcada de la referencia del usuario.
export const RUNES = {
  berserk: 'M16 1.5 L16 30 M16 5 L13.5 2 M16 5 L18.5 2 M11 5 L8.5 7.5 L16 15 L23.5 7.5 L21 5 M16 15 L8.5 22.5 L16 30 L23.5 22.5 L16 15',
  chest: 'M10 4 L10 28 M10 6 L24 14 M10 22 L24 14',
  back: 'M22 4 L22 28 M22 6 L8 14 M22 22 L8 14',
  biceps: 'M12 28 L12 4 L24 12 L12 18',
  triceps: 'M20 28 L20 4 L8 12 L20 18',
  shoulders: 'M6 28 L16 4 L26 28 M11 16 L21 16',
  legs: 'M16 4 L16 28 M16 16 L7 28 M16 16 L25 28',
  core: 'M16 4 L26 16 L16 28 L6 16 Z',
  streak: 'M18 3 L10 17 L16 17 L14 29 L23 13 L17 13 Z',
  // item 4 (round 9): se quita el trazo horizontal de debajo (subrayado) —
  // el vertical se extiende hasta y=28 para mantener el equilibrio visual
  // sin él. Compartida por el nav de Progresión y la lista de PRs: el
  // cambio aplica a los dos a la vez a propósito, es el mismo símbolo.
  pr: 'M16 4 L16 28 M8 10 L16 4 L24 10',
  // item 4 (round 9): ᛋ sowilo (rayo) — para el nav de Hoy
  sowilo: 'M23 3 L9 15 L23 15 L9 27',
  // item 4 (round 9): zurdi lo llamó "Eihwaz" pero enlazó la imagen de
  // referencia de dagaz ᛞ (dos verticales + aspa) — manda la imagen; el
  // identificador queda como dagaz, no eihwaz, para que combine con la
  // forma real en vez del nombre que se dijo en voz alta
  dagaz: 'M10 4 L10 28 M22 4 L22 28 M10 4 L22 28 M10 28 L22 4',
} as const

export type RuneName = keyof typeof RUNES

// fases de tallado: cada entrada se dibuja completa antes de la siguiente;
// los subtrazos de una misma fase se tallan a la vez (simetría izquierda/derecha)
export const RUNE_SEQUENCES: Partial<Record<RuneName, string[]>> = {
  berserk: [
    'M11 5 L8.5 7.5 L16 15 M21 5 L23.5 7.5 L16 15',
    'M16 15 L8.5 22.5 L16 30 M16 15 L23.5 22.5 L16 30',
    'M16 1.5 L16 30 M16 5 L13.5 2 M16 5 L18.5 2',
  ],
}
