'use client'
import { useEffect, useState } from 'react'
import { fmtAmount } from '../../_lib/formatters'

export interface ServerAggregates {
  gastoMes: number
  porNaturaleza: { nature: string | null; total: number }[]
  porCategoriaRaiz: { rootId: string | null; rootName: string; color: string | null; total: number }[]
  superObservado: number | null
  fijosObservados: number | null
  ingresoSalarialMediano: number | null
  mesesConDatos: number
  ingresosNoSalariales: number | null
}

interface GastoFijo {
  id: string
  name: string
  amount: number
  frequency: 'monthly' | 'annual'
}

interface Props {
  serverAggregates: ServerAggregates
  userId: string
  mes: string
}

const NATURE_LABELS: Record<string, string> = {
  fijo_recurrente: 'Fijos recurrentes',
  variable_recurrente: 'Variables recurrentes',
  extraordinario: 'Extraordinarios',
  inversion: 'Inversión',
  ahorro: 'Ahorro',
  transferencia: 'Transferencias internas',
}

export function AggregatesPanel({ serverAggregates: agg, userId }: Props) {
  const [mounted, setMounted] = useState(false)
  const [incomeExpected, setIncomeExpected] = useState<number | null>(null)
  const [incomeJoint, setIncomeJoint] = useState<number | null>(null)
  const [gastosFijosTotal, setGastosFijosTotal] = useState<number | null>(null)

  useEffect(() => {
    try {
      const ie = localStorage.getItem(`egmfin.income_expected.${userId}`)
      setIncomeExpected(ie ? Number(ie) : null)

      const ij = localStorage.getItem('egmfin.income_expected_joint')
      setIncomeJoint(ij ? Number(ij) : null)

      const gf = localStorage.getItem(`egmfin.gastos_fijos.${userId}`)
      if (gf) {
        const arr: GastoFijo[] = JSON.parse(gf)
        const total = arr.reduce(
          (s, g) => s + (g.frequency === 'monthly' ? g.amount : g.amount / 12),
          0,
        )
        setGastosFijosTotal(total)
      }
    } catch {
      // localStorage parse errors silenced
    }
    setMounted(true)
  }, [userId])

  return (
    <div style={{ marginBottom: 28 }}>

      {/* Gasto del mes */}
      <PanelSection title="Gasto del mes">
        <AggregateRow label="Total" value={agg.gastoMes} strong />
      </PanelSection>

      {/* Por naturaleza */}
      {agg.porNaturaleza.length > 0 && (
        <PanelSection title="Por naturaleza">
          {agg.porNaturaleza.map(({ nature, total }) => (
            <AggregateRow
              key={nature ?? '__null__'}
              label={nature ? (NATURE_LABELS[nature] ?? nature) : 'Sin clasificar'}
              value={total}
              muted={!nature}
            />
          ))}
        </PanelSection>
      )}

      {/* Por categoría raíz */}
      {agg.porCategoriaRaiz.length > 0 && (
        <PanelSection title="Por categoría">
          {agg.porCategoriaRaiz.map(({ rootId, rootName, color, total }) => (
            <AggregateRow
              key={rootId ?? '__null__'}
              label={rootName}
              value={total}
              bullet={rootId !== null ? color : undefined}
              muted={!rootId}
            />
          ))}
        </PanelSection>
      )}

      {/* Observado */}
      <PanelSection title="Observado">
        <AggregateRow label="Supermercado" value={agg.superObservado} />
        <AggregateRow label="Gastos fijos" value={agg.fijosObservados} />
      </PanelSection>

      {/* Ingresos */}
      <PanelSection title="Ingresos">
        <AggregateRow
          label={`Salario estimado · med. ${agg.mesesConDatos}m`}
          value={agg.ingresoSalarialMediano}
        />
        <AggregateRow label="Registrados este mes" value={agg.ingresosNoSalariales} />
      </PanelSection>

      {/* Declarados — localStorage, anti-hydration */}
      <PanelSection title="Declarados">
        {!mounted ? (
          <AggregateRow label="…" value={null} muted />
        ) : (
          <>
            <AggregateRow label="Ingreso esperado personal" value={incomeExpected} />
            <AggregateRow label="Ingreso conjunto declarado" value={incomeJoint} />
            <AggregateRow label="Gastos fijos declarados · mes" value={gastosFijosTotal} />
          </>
        )}
      </PanelSection>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        className="label"
        style={{ fontSize: 9, color: 'var(--ink-4)', letterSpacing: '0.14em', marginBottom: 2 }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function AggregateRow({
  label,
  value,
  muted,
  strong,
  bullet,
}: {
  label: string
  value: number | null
  muted?: boolean
  strong?: boolean
  bullet?: string | null  // undefined = sin punto; null = punto gris; hex = punto color
}) {
  const textColor = muted ? 'var(--ink-4)' : 'var(--ink-2)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 0',
        borderBottom: '1px solid var(--rule-2)',
      }}
    >
      {bullet !== undefined && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            flexShrink: 0,
            background: bullet ?? 'var(--rule)',
          }}
        />
      )}
      <span className="roman" style={{ flex: 1, fontSize: 13, color: textColor }}>
        {label}
      </span>
      <span
        className="num"
        style={{ fontSize: 13, color: textColor, fontWeight: strong ? 600 : 400 }}
      >
        {value !== null ? fmtAmount(value) : '——'}
      </span>
    </div>
  )
}
