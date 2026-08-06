// mapeo de status a clases Tailwind para los dots
export const statusClasses = (status: string) => {
  if (status === 'planned') return 'border-2 border-aurora rounded-full'
  if (status === 'done') return 'bg-aurora rounded-full'
  if (status === 'skipped') return 'bg-ink-faint rounded-full'
  return 'bg-ink-faint rounded-full'
}
