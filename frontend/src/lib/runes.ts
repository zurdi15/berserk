// Runas geométricas sobre rejilla 32×32: trazos rectos para que el
// "tallado" (dashoffset) luzca. Dos familias en el mismo diccionario:
// - Marcas de la casa (no futhark canónico): berserk, chest/back/biceps/
//   triceps/shoulders/legs/core (grupos musculares), streak, pr.
// - Futhark antiguo completo (24 runas, v0.3.0, ver bloque más abajo), para
//   el selector de rutinas — sowilo y dagaz ya vivían aquí desde antes.
// berserk es el bindrune del berserker (lanza + aspa astada + rombo),
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

  // v0.3.0: Futhark antiguo completo (24 runas) para el selector de rutinas.
  // sowilo y dagaz (arriba) ya cubrían dos; el resto se añade aquí, en
  // orden canónico del futhark, sobre la misma rejilla 32×32 y las mismas
  // convenciones de trazo recto que el resto del catálogo (ver cabecera del
  // fichero). Ninguna reutiliza el path de una runa de grupo muscular byte
  // a byte — donde la forma canónica coincide con una ya existente, se
  // documenta la relación en vez de duplicar coordenadas a ciegas.
  fehu: 'M10 4 L10 28 M10 9 L23 4 M10 17 L23 12',
  uruz: 'M9 4 L9 28 M9 4 L23 14 M23 14 L23 28',
  thurisaz: 'M10 4 L10 28 M10 14 L18 18 L10 22',
  ansuz: 'M10 4 L10 28 M10 4 L24 16',
  raidho: 'M10 4 L10 28 M10 6 L20 11 L10 16 M10 16 L23 28',
  kenaz: 'M22 6 L10 16 L22 26',
  gebo: 'M8 6 L24 26 M24 6 L8 26',
  wunjo: 'M10 4 L10 28 M10 4 L22 7 L10 11',
  hagalaz: 'M10 4 L10 28 M22 4 L22 28 M10 10 L22 22',
  nauthiz: 'M16 4 L16 28 M10 10 L22 22',
  isa: 'M16 4 L16 28',
  jera: 'M9 8 L16 13 L9 18 M23 14 L16 19 L23 24',
  eihwaz: 'M16 4 L16 28 M16 4 L22 9 M16 28 L10 23',
  // perthro ᛈ: cofre/copa de suertes en ángulo recto (a diferencia del
  // resto, que son diagonales) — es de las formas menos consensuadas del
  // futhark en las fuentes; revisar contra referencia antes de dar por
  // buena (ver informe).
  perthro: 'M10 4 L10 28 M10 4 L22 4 M22 4 L22 16',
  // algiz ᛉ es "legs" reflejada verticalmente: mismo tallo + aspas desde el
  // punto medio, pero abriéndose hacia ARRIBA en vez de hacia abajo — misma
  // familia visual (coherente con la rejilla), forma y runa distintas.
  algiz: 'M16 4 L16 28 M16 16 L7 4 M16 16 L25 4',
  // tiwaz ᛏ (Týr): el path de "pr" YA es el glifo canónico de tiwaz (tallo +
  // flecha), documentado como tal en su propio comentario más arriba. Se
  // reexporta bajo el nombre futhark en vez de inventar una variante nueva
  // — así el selector de rutinas puede listar el set completo sin dos
  // dibujos distintos para la misma letra.
  tiwaz: 'M16 4 L16 28 M8 10 L16 4 L24 10',
  berkano: 'M10 4 L10 28 M10 4 L18 8 L10 14 M10 14 L20 20 L10 26',
  ehwaz: 'M9 6 L9 26 M23 6 L23 26 M9 16 L23 16',
  mannaz: 'M10 4 L10 28 M22 4 L22 28 M10 4 L16 20 M22 4 L16 20',
  laguz: 'M16 4 L16 22 M16 22 L8 28',
  // ingwaz ᛜ: reloj de arena (dos triángulos cerrados, ápices en el centro)
  // en vez del rombo simple — "core" ya es ese rombo, y reutilizar la misma
  // silueta para dos runas distintas rompería la regla de no duplicar
  // formas. El reloj de arena es la otra variante históricamente atestiguada.
  ingwaz: 'M10 4 L16 16 L22 4 Z M10 28 L16 16 L22 28 Z',
  othala: 'M16 4 L8 13 M16 4 L24 13 M8 13 L6 28 M24 13 L26 28',
} as const

export type RuneName = keyof typeof RUNES

// orden canónico del futhark antiguo (los tres ættir de 8 runas): fuente
// única para el selector de runas de RoutineEditorSheet y para el test que
// pinnea que el set está completo — así no hay dos listas que puedan
// desincronizarse.
export const FUTHARK_RUNE_NAMES: RuneName[] = [
  'fehu', 'uruz', 'thurisaz', 'ansuz', 'raidho', 'kenaz', 'gebo', 'wunjo',
  'hagalaz', 'nauthiz', 'isa', 'jera', 'eihwaz', 'perthro', 'algiz', 'sowilo',
  'tiwaz', 'berkano', 'ehwaz', 'mannaz', 'laguz', 'ingwaz', 'dagaz', 'othala',
]

// fases de tallado: cada entrada se dibuja completa antes de la siguiente;
// los subtrazos de una misma fase se tallan a la vez (simetría izquierda/derecha)
export const RUNE_SEQUENCES: Partial<Record<RuneName, string[]>> = {
  berserk: [
    'M11 5 L8.5 7.5 L16 15 M21 5 L23.5 7.5 L16 15',
    'M16 15 L8.5 22.5 L16 30 M16 15 L23.5 22.5 L16 30',
    'M16 1.5 L16 30 M16 5 L13.5 2 M16 5 L18.5 2',
  ],
}
