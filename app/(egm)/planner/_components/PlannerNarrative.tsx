import { fmtAmount } from '../../_lib/formatters'
import { type PlannerData } from '../page'

interface Props {
  data: PlannerData
  incomeExpected: number | null
  fijosDeclarados: number | null
  mounted: boolean
}

export function PlannerNarrative({ data, incomeExpected, fijosDeclarados, mounted }: Props) {
  const sentences: string[] = []

  // Consumo vs baseline
  if (data.baseline.consumo != null && data.baseline.consumo > 0 && data.consumo > 0) {
    const diff = ((data.consumo - data.baseline.consumo) / data.baseline.consumo) * 100
    if (Math.abs(diff) > 5) {
      sentences.push(
        diff > 0
          ? `El consumo de este mes está un ${diff.toFixed(0)}% por encima de tu media trimestral.`
          : `El consumo de este mes está un ${Math.abs(diff).toFixed(0)}% por debajo de tu media trimestral.`
      )
    }
  }

  // Tasa de remanente
  if (data.ingresosMes > 0) {
    const rate = (data.remanente / data.ingresosMes) * 100
    sentences.push(
      data.remanente >= 0
        ? `Remanente: ${rate.toFixed(0)}% de los ingresos registrados.`
        : `El consumo supera los ingresos registrados en un ${Math.abs(rate).toFixed(0)}%.`
    )
  } else if (mounted && incomeExpected) {
    sentences.push(
      `Sin ingresos registrados este mes (esperado declarado: ${fmtAmount(incomeExpected)}).`
    )
  }

  // Fijos declarados vs observados (solo si mounted y hay valor)
  if (mounted && fijosDeclarados && data.fijosObservados > 0) {
    const diff = data.fijosObservados - fijosDeclarados
    if (Math.abs(diff) > fijosDeclarados * 0.05) {
      sentences.push(
        diff > 0
          ? `Los fijos observados superan lo declarado en ${fmtAmount(diff)}.`
          : `Los fijos observados están ${fmtAmount(Math.abs(diff))} por debajo de lo declarado.`
      )
    }
  }

  // Inversiones
  if (data.inversiones > 0) {
    sentences.push(`Asignaste ${fmtAmount(data.inversiones)} a inversiones este mes.`)
  }

  // Maristas
  if (data.maristas > 0) {
    sentences.push(`Destinaste ${fmtAmount(data.maristas)} al proyecto Maristas.`)
  }

  // Supermercado vs baseline
  if (data.superObservado != null && data.baseline.superObservado != null && data.baseline.superObservado > 0) {
    const diff = ((data.superObservado - data.baseline.superObservado) / data.baseline.superObservado) * 100
    if (Math.abs(diff) > 10) {
      sentences.push(
        `Supermercado: ${fmtAmount(data.superObservado)}, un ${Math.abs(diff).toFixed(0)}% ${diff > 0 ? 'más' : 'menos'} que la media trimestral.`
      )
    }
  }

  if (sentences.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sentences.map((s, i) => (
        <p key={i} className="roman" style={{ fontSize: 13, lineHeight: 1.55, margin: 0, color: 'var(--ink-2)' }}>
          {s}
        </p>
      ))}
    </div>
  )
}
