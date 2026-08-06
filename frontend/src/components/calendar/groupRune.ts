import type { RuneName } from '@/lib/runes'

// validar si un slug es un RuneName válido para renderizar como BkRune
export function isValidRuneName(slug: string): slug is RuneName {
  const validRunes: RuneName[] = ['chest', 'back', 'biceps', 'triceps', 'shoulders', 'legs', 'core', 'berserk', 'streak', 'pr']
  return validRunes.includes(slug as RuneName)
}
