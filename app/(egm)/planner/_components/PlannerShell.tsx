'use client'
import { useEffect, useState } from 'react'
import { fmtAmount } from '../../_lib/formatters'
import { PlannerCard } from './PlannerCard'
import { PlannerGrid } from './PlannerGrid'
import { type PlannerData } from '../page'

interface Props {
  data: PlannerData
  userId: string
}

export function PlannerShell({ data, userId }: Props) {
  const [incomeExpected, setIncomeExpected] = useState<number | null>(null)

  // Anti-hydration: read localStorage only on client mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`egmfin.income_expected.${userId}`)
      setIncomeExpected(raw ? Number(raw) : null)
    } catch {
      // ignore
    }
  }, [userId])

  // Sublabel for Ingresos: show declared expected if no actual incomes recorded
  const ingresoSublabel =
    data.ingresosMes === 0 && incomeExpected
      ? `Declarado: ${fmtAmount(incomeExpected)} · sin registros este mes`
      : data.ingresosMes > 0 && incomeExpected
      ? `Esperado declarado: ${fmtAmount(incomeExpected)}`
      : undefined

  return (
    <PlannerGrid>
      <PlannerCard
        label="Gasto total"
        value={data.gastoMes}
        tone="negative"
      />
      <PlannerCard
        label="Ingresos totales"
        value={data.ingresosMes}
        tone="positive"
        sublabel={ingresoSublabel}
      />
      <PlannerCard
        label="Balance"
        value={data.balance}
        tone={data.balance >= 0 ? 'positive' : 'negative'}
      />
      <PlannerCard
        label="Ahorro"
        value={data.ahorro}
        tone={data.ahorro >= 0 ? 'positive' : 'negative'}
        sublabel={data.fijosObservados > 0 ? `Fijos observados: ${fmtAmount(data.fijosObservados)}` : undefined}
      />
    </PlannerGrid>
  )
}
