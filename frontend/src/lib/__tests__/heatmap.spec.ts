import { describe, expect, it } from 'vitest'

import { monthBlocksFor } from '../heatmap'

describe('monthBlocksFor', () => {
  it('returns 12 blocks, one per month, each with day 1 in row 0', () => {
    const blocks = monthBlocksFor(2026, [])
    expect(blocks).toHaveLength(12)
    for (let i = 0; i < 12; i++) {
      expect(blocks[i].month).toBe(i + 1)
      const day1 = blocks[i].cells[0]
      expect(day1.row).toBe(0)
    }
  })

  it('enero 2026 (1 ene = jueves, columna 3): día 1 en fila 0 columna 3, y el bloque ocupa 5 filas', () => {
    const [january] = monthBlocksFor(2026, [])
    expect(january.rowCount).toBe(5)
    const day1 = january.cells.find((c) => c.date === '2026-01-01')!
    expect(day1.row).toBe(0)
    expect(day1.col).toBe(3) // jueves: 0=lunes..6=domingo
    // 31 días de enero, todos presentes
    expect(january.cells).toHaveLength(31)
  })

  it('la semana de frontera enero/febrero 2026 se reparte entre los dos bloques: cada uno solo trae sus propios días', () => {
    const [january, february] = monthBlocksFor(2026, [])

    // última fila de enero (fila 4): 26-31 ene, lunes a sábado (columnas 0-5) —
    // el domingo de esa misma semana (1 feb) NO aparece en el bloque de enero
    const lastJanRow = january.cells.filter((c) => c.row === 4)
    expect(lastJanRow).toHaveLength(6)
    expect(lastJanRow.map((c) => c.date).sort()).toEqual([
      '2026-01-26', '2026-01-27', '2026-01-28', '2026-01-29', '2026-01-30', '2026-01-31',
    ])
    expect(lastJanRow.every((c) => c.col >= 0 && c.col <= 5)).toBe(true)

    // primera fila de febrero (fila 0): SOLO el domingo 1 feb (columna 6) —
    // los días lunes-sábado de esa semana pertenecen a enero, no a este bloque
    const firstFebRow = february.cells.filter((c) => c.row === 0)
    expect(firstFebRow).toHaveLength(1)
    expect(firstFebRow[0]).toEqual({ date: '2026-02-01', count: 0, row: 0, col: 6 })
  })

  it('cada bloque cubre exactamente los días del mes, sin huecos ni duplicados', () => {
    const blocks = monthBlocksFor(2026, [])
    const daysInMonth2026 = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    blocks.forEach((block, i) => {
      expect(block.cells).toHaveLength(daysInMonth2026[i])
      const dates = new Set(block.cells.map((c) => c.date))
      expect(dates.size).toBe(block.cells.length) // sin duplicados
    })
  })

  it('rowCount es siempre exactamente la fila más alta usada + 1 (sin filas colgando de más)', () => {
    for (const year of [2024, 2025, 2026, 2027, 2028]) {
      for (const block of monthBlocksFor(year, [])) {
        const maxRow = Math.max(...block.cells.map((c) => c.row))
        expect(block.rowCount).toBe(maxRow + 1)
      }
    }
  })

  it('col nunca sale de 0-6 (día de la semana): el eje horizontal es fijo tras la transposición', () => {
    for (const block of monthBlocksFor(2026, [])) {
      for (const cell of block.cells) {
        expect(cell.col).toBeGreaterThanOrEqual(0)
        expect(cell.col).toBeLessThanOrEqual(6)
      }
    }
  })

  it('propaga los counts del mapa de datos por fecha, y usa 0 para fechas ausentes', () => {
    const [january] = monthBlocksFor(2026, [{ date: '2026-01-15', count: 3 }])
    const hit = january.cells.find((c) => c.date === '2026-01-15')!
    const miss = january.cells.find((c) => c.date === '2026-01-16')!
    expect(hit.count).toBe(3)
    expect(miss.count).toBe(0)
  })
})
