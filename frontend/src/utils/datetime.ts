// El backend serializa datetimes naive (sin offset) que SIEMPRE representan
// UTC (ver backend/app/models.py:utcnow). `new Date(str)` sobre un string sin
// 'Z' ni offset lo interpreta como hora LOCAL del navegador, desplazando el
// valor por el offset del viewer (p.ej. +2h en Europe/Madrid). parseUtc
// normaliza añadiendo 'Z' solo cuando el string no trae ya un offset explícito.
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/

export function parseUtc(value: string): Date {
  if (!value.includes('T')) return new Date(value) // fecha sin hora: ya es UTC-medianoche por spec
  return new Date(HAS_OFFSET.test(value) ? value : `${value}Z`)
}
