export type ConsumoRow = { amount: number; nature: string | null; project_id: string | null }

// consumo = outflows excl. transferencia, inversion, y capex del proyecto Maristas
export function computeConsumo(txns: ConsumoRow[], maristasProjectId: string | null): number {
  return txns.reduce((s, r) => {
    if (r.amount >= 0) return s
    if (r.nature === 'transferencia' || r.nature === 'inversion') return s
    if (maristasProjectId && r.project_id === maristasProjectId) return s
    return s + Math.abs(r.amount)
  }, 0)
}
