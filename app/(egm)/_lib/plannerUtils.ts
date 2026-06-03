import { computeConsumo } from './computeConsumo'

// ── Types ────────────────────────────────────────────────────

export type TendenciaPoint = { mes: string; value: number | null }

export interface PlannerData {
  consumo: number
  ingresosMes: number
  fijosObservados: number
  remanente: number
  inversiones: number
  maristas: number
  superObservado: number | null
  porNaturaleza: { nature: string | null; total: number }[]
  baseline: {
    consumo: number | null
    superObservado: number | null
    fijosObservados: number | null
    inversiones: number | null
    maristas: number | null
  }
  tendencia: {
    consumo:         TendenciaPoint[]
    remanente:       TendenciaPoint[]
    superObservado:  TendenciaPoint[]
    fijosObservados: TendenciaPoint[]
  }
}

type TxnRow = { amount: number; nature: string | null; project_id: string | null }
type TxnRowWithDate = TxnRow & { date: string }
type IncomeRowDate = { net_amount: number; date: string }
type FixedRow = { total_spent: number; year: number; month: number }
type SpentRow = { spent: number; year: number; month: number }

// ── Helpers ──────────────────────────────────────────────────

export function priorMonthsList(mes: string, count: number): { year: number; month: number }[] {
  const [y, m] = mes.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    let yr = y
    let mo = m - (i + 1)
    while (mo <= 0) { mo += 12; yr-- }
    return { year: yr, month: mo }
  })
}

export function computeTendencia(
  window6: { year: number; month: number }[],
  prior6Txns: TxnRowWithDate[],
  prior6Incomes: IncomeRowDate[],
  fixedAll: FixedRow[],
  superAll: SpentRow[] | null,
  maristasProjectId: string | null,
): PlannerData['tendencia'] {
  const chrono = [...window6].reverse()

  const txnsByMonth = new Map<string, TxnRowWithDate[]>()
  for (const t of prior6Txns) {
    const key = t.date.slice(0, 7)
    if (!txnsByMonth.has(key)) txnsByMonth.set(key, [])
    txnsByMonth.get(key)!.push(t)
  }

  const incomesByMonth = new Map<string, number>()
  for (const i of prior6Incomes) {
    const key = i.date.slice(0, 7)
    incomesByMonth.set(key, (incomesByMonth.get(key) ?? 0) + Number(i.net_amount))
  }

  const consumoSeries:   TendenciaPoint[] = []
  const remanenteSeries: TendenciaPoint[] = []
  const superSeries:     TendenciaPoint[] = []
  const fijosSeries:     TendenciaPoint[] = []

  for (const { year, month } of chrono) {
    const mes = `${year}-${String(month).padStart(2, '0')}`
    const monthTxns = txnsByMonth.get(mes)
    const consumoVal = monthTxns === undefined ? null : computeConsumo(monthTxns, maristasProjectId)
    consumoSeries.push({ mes, value: consumoVal })

    const incomesVal = incomesByMonth.get(mes)
    const remanenteVal = incomesVal === undefined ? null : incomesVal - (consumoVal ?? 0)
    remanenteSeries.push({ mes, value: remanenteVal })

    const superRow = superAll?.find(r => r.year === year && r.month === month)
    superSeries.push({ mes, value: superRow !== undefined ? Number(superRow.spent) : null })

    const fixedRow = fixedAll.find(r => r.year === year && r.month === month)
    fijosSeries.push({ mes, value: fixedRow !== undefined ? Number(fixedRow.total_spent) : null })
  }

  return { consumo: consumoSeries, remanente: remanenteSeries, superObservado: superSeries, fijosObservados: fijosSeries }
}

export function computePlannerData(
  txns: TxnRow[],
  fixedAll: FixedRow[],
  incomesData: { net_amount: number }[],
  maristasProjectId: string | null,
  superAll: SpentRow[] | null,
  year: number,
  month: number,
  prior3: { year: number; month: number }[],
  prior6: { year: number; month: number }[],
  prior6Txns: TxnRowWithDate[],
  prior6Incomes: IncomeRowDate[],
): PlannerData {
  const consumo = computeConsumo(txns, maristasProjectId)
  const ingresosMes = incomesData.reduce((s, r) => s + Number(r.net_amount), 0)
  const fixedCurr = fixedAll.find((r) => r.year === year && r.month === month)
  const fijosObservados = fixedCurr ? Number(fixedCurr.total_spent) : 0
  const remanente = ingresosMes - consumo

  const inversiones = txns
    .filter((r) => r.nature === 'inversion' && r.amount < 0)
    .reduce((s, r) => s + Math.abs(r.amount), 0)

  const maristas = txns
    .filter((r) => r.amount < 0 && maristasProjectId !== null && r.project_id === maristasProjectId)
    .reduce((s, r) => s + Math.abs(r.amount), 0)

  const superCurrRow = superAll?.find((r) => r.year === year && r.month === month)
  const superObservado = superCurrRow ? Number(superCurrRow.spent) : null

  const natMap = new Map<string | null, number>()
  for (const r of txns) {
    if (r.amount >= 0) continue
    if (r.nature === 'transferencia' || r.nature === 'inversion') continue
    if (maristasProjectId && r.project_id === maristasProjectId) continue
    natMap.set(r.nature, (natMap.get(r.nature) ?? 0) + Math.abs(r.amount))
  }
  const porNaturaleza = Array.from(natMap.entries())
    .map(([nature, total]) => ({ nature, total }))
    .sort((a, b) => b.total - a.total)

  const prior3Earliest = prior3[prior3.length - 1]
  const prior3DateStart = `${prior3Earliest.year}-${String(prior3Earliest.month).padStart(2, '0')}-01`
  const prior3TxnsFiltered = prior6Txns.filter(t => t.date >= prior3DateStart)
  const n = prior3.length || 1

  const baseConsumo = computeConsumo(prior3TxnsFiltered, maristasProjectId) / n
  const baseInversiones =
    prior3TxnsFiltered
      .filter((r) => r.nature === 'inversion' && r.amount < 0)
      .reduce((s, r) => s + Math.abs(r.amount), 0) / n
  const baseMaristas =
    prior3TxnsFiltered
      .filter((r) => r.amount < 0 && maristasProjectId !== null && r.project_id === maristasProjectId)
      .reduce((s, r) => s + Math.abs(r.amount), 0) / n

  const prior3FixedVals = prior3
    .map(({ year: y, month: m }) => fixedAll.find((r) => r.year === y && r.month === m))
    .filter(Boolean)
    .map((r) => Number(r!.total_spent))
  const baseFijos =
    prior3FixedVals.length > 0 ? prior3FixedVals.reduce((s, v) => s + v, 0) / prior3FixedVals.length : null

  const prior3SuperVals = prior3
    .map(({ year: y, month: m }) => superAll?.find((r) => r.year === y && r.month === m))
    .filter(Boolean)
    .map((r) => Number(r!.spent))
  const baseSuper =
    prior3SuperVals.length > 0 ? prior3SuperVals.reduce((s, v) => s + v, 0) / prior3SuperVals.length : null

  const tendencia = computeTendencia(prior6, prior6Txns, prior6Incomes, fixedAll, superAll, maristasProjectId)

  return {
    consumo, ingresosMes, fijosObservados, remanente,
    inversiones, maristas,
    superObservado, porNaturaleza,
    baseline: {
      consumo: baseConsumo,
      superObservado: baseSuper,
      fijosObservados: baseFijos,
      inversiones: baseInversiones,
      maristas: baseMaristas,
    },
    tendencia,
  }
}
