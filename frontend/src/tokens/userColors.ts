// Paleta de colores de usuario: identidad visual por atleta (dot en el
// calendario, badges de "compartido conmigo"...), NO un token del sistema de
// diseño. Vive en src/tokens/ igualmente porque guard-tokens.sh excluye este
// directorio del check de hex crudo — son los únicos hex legítimos fuera de
// tokens.css, así que el guard los trata igual que ya trata el propio tema.
// Curados a mano para distinguirse de aurora/ember/danger (los acentos de la
// UI) y para leerse bien tanto en fondo claro como oscuro.
export const USER_COLOR_SWATCHES = [
  '#7C8FFF', // índigo
  '#B47EE5', // violeta
  '#D66FB0', // magenta
  '#E0B84C', // oro
  '#5AA9E6', // cielo
  '#7FBF6B', // salvia
  '#7E8FA6', // pizarra
  '#C08552', // cobre
] as const

export type UserColorSwatch = (typeof USER_COLOR_SWATCHES)[number]
