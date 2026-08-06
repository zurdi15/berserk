import { RUNES, type RuneName } from '@/lib/runes'

// validar si un slug es un RuneName válido para renderizar como BkRune
export function isValidRuneName(slug: string): slug is RuneName {
  return Object.keys(RUNES).includes(slug)
}
