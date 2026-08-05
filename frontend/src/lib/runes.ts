// Runas geométricas propias sobre rejilla 32×32 (marcas de la casa, no
// futhark canónico): trazos rectos para que el "tallado" (dashoffset) luzca.
// Excepto berserk, que es el Ægishjálmur (Helm de Awe) — el sigilo del berserker.
export const RUNES = {
  berserk: 'M16 16 L16 3 M16 6 L12.5 2.5 M16 6 L19.5 2.5 M13 9 L19 9 M16 16 L29 16 M26 16 L29.5 12.5 M26 16 L29.5 19.5 M23 13 L23 19 M16 16 L16 29 M16 26 L12.5 29.5 M16 26 L19.5 29.5 M13 23 L19 23 M16 16 L3 16 M6 16 L2.5 12.5 M6 16 L2.5 19.5 M9 13 L9 19 M16 16 L24.5 7.5 M22.5 9.5 L22.5 5.5 M22.5 9.5 L26.5 9.5 M16 16 L24.5 24.5 M22.5 22.5 L26.5 22.5 M22.5 22.5 L22.5 26.5 M16 16 L7.5 24.5 M9.5 22.5 L9.5 26.5 M9.5 22.5 L5.5 22.5 M16 16 L7.5 7.5 M9.5 9.5 L5.5 9.5 M9.5 9.5 L9.5 5.5',
  chest: 'M10 4 L10 28 M10 6 L24 14 M10 22 L24 14',
  back: 'M22 4 L22 28 M22 6 L8 14 M22 22 L8 14',
  biceps: 'M12 28 L12 4 L24 12 L12 18',
  triceps: 'M20 28 L20 4 L8 12 L20 18',
  shoulders: 'M6 28 L16 4 L26 28 M11 16 L21 16',
  legs: 'M16 4 L16 28 M16 16 L7 28 M16 16 L25 28',
  core: 'M16 4 L26 16 L16 28 L6 16 Z',
  streak: 'M18 3 L10 17 L16 17 L14 29 L23 13 L17 13 Z',
  pr: 'M16 4 L16 22 M8 10 L16 4 L24 10 M10 28 L22 28',
} as const

export type RuneName = keyof typeof RUNES
