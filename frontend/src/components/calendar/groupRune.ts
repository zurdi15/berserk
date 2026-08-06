// mapeo de slugs de grupos musculares a emojis
const runeMap: Record<string, string> = {
  chest: '💪',
  back: '🏋️',
  legs: '🦵',
  shoulders: '🔶',
  biceps: '💥',
  triceps: '🌟',
  core: '🎯',
}

export function groupRune(slug: string): string {
  return runeMap[slug] ?? runeMap.core
}
