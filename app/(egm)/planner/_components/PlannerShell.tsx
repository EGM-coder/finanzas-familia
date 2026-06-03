'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtAmount } from '../../_lib/formatters'
import { PlannerCard } from './PlannerCard'
import { PlannerGrid } from './PlannerGrid'
import { PlannerBarCompare } from './PlannerBarCompare'
import { PlannerDonut } from './PlannerDonut'
import { PlannerNarrative } from './PlannerNarrative'
import { PlannerTrend } from './PlannerTrend'
import { AdvisorSlot } from './AdvisorSlot'
import { type PlannerData } from '../../_lib/plannerUtils'

interface Props {
  data: PlannerData
  userId: string
  mes: string
  maristasProjectId: string | null
}

const NATURE_LABELS: Record<string, string> = {
  fijo_recurrente:     'Fijo recurrente',
  variable_recurrente: 'Variable',
  extraordinario:      'Extraordinario',
  ahorro:              'Ahorro',
}

const NATURE_COLORS: Record<string, string> = {
  fijo_recurrente:     '#4a7c59',
  variable_recurrente: '#4a80b5',
  extraordinario:      '#c47c3a',
  ahorro:              '#1f6b3a',
}

// Natures del consumo que tienen filtro directo en CONTROL
const NATURE_NAVIGABLE = new Set(['variable_recurrente', 'extraordinario'])

function Hairline() {
  return <div style={{ height: 1, background: 'var(--rule)', margin: '28px 0' }} />
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="label" style={{ marginBottom: 16, color: 'var(--ink-3)' }}>
      {children}
    </div>
  )
}

export function PlannerShell({ data, userId, mes, maristasProjectId }: Props) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [incomeExpected, setIncomeExpected] = useState<number | null>(null)
  const [fijosDeclarados, setFijosDeclarados] = useState<number | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`egmfin.income_expected.${userId}`)
      setIncomeExpected(raw ? Number(raw) : null)
      const rawFijos = localStorage.getItem(`egmfin.gastos_fijos.${userId}`)
      setFijosDeclarados(rawFijos ? Number(rawFijos) : null)
    } catch {
      // ignore
    }
    setMounted(true)
  }, [userId])

  const nav = (path: string) => router.push(path, { scroll: false })

  const ingresoSublabel =
    data.ingresosMes === 0 && incomeExpected
      ? `Declarado: ${fmtAmount(incomeExpected)} · sin registros este mes`
      : data.ingresosMes > 0 && incomeExpected
      ? `Esperado declarado: ${fmtAmount(incomeExpected)}`
      : undefined

  // Donut: solo natures del consumo (excl. transferencia, inversion, Maristas — ya filtradas en data)
  const donutSegments = data.porNaturaleza
    .filter((n) => n.total > 0)
    .map((n) => ({
      label: NATURE_LABELS[n.nature ?? ''] ?? 'Sin clasificar',
      value: n.total,
      color: NATURE_COLORS[n.nature ?? ''] ?? 'var(--ink-4)',
    }))

  return (
    <div>
      <style>{`
        .planner-nav-row { cursor: pointer; }
        .planner-nav-row:hover .planner-nav-amount {
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 3px;
        }
      `}</style>

      {/* ── Sección 1: Resumen operativo ── */}
      {/* Consumo + Ingresos: insumos en 2 columnas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, background: 'var(--rule)' }}>
        <PlannerCard
          label="Consumo"
          value={data.consumo}
          tone="negative"
          sublabel={data.fijosObservados > 0 ? `Fijos observados: ${fmtAmount(data.fijosObservados)}` : undefined}
        />
        <PlannerCard
          label="Ingresos totales"
          value={data.ingresosMes}
          tone="positive"
          sublabel={ingresoSublabel}
        />
        {/* Remanente: conclusión del bloque, banda full-width */}
        <div style={{ gridColumn: '1 / -1' }}>
          <PlannerCard
            label="Remanente"
            value={data.remanente}
            tone={data.remanente >= 0 ? 'positive' : 'negative'}
          />
        </div>
      </div>

      <Hairline />

      {/* ── Sección 2: Asignación de capital ── */}
      <SectionLabel>Asignación de capital</SectionLabel>
      <PlannerGrid>
        <PlannerCard
          label="Inversiones"
          value={data.inversiones}
          tone={data.inversiones > 0 ? 'positive' : 'neutral'}
          onClick={() => nav(`/control?mes=${mes}&nature=inversion&view=apuntes`)}
        />
        <PlannerCard
          label="Proyecto Maristas"
          value={data.maristas}
          tone={data.maristas > 0 ? 'positive' : 'neutral'}
          onClick={
            maristasProjectId
              ? () => nav(`/control?mes=${mes}&project_id=${maristasProjectId}&view=apuntes`)
              : undefined
          }
        />
      </PlannerGrid>

      <Hairline />

      {/* ── Sección 3: Distribución del consumo ── */}
      <SectionLabel>Distribución del consumo</SectionLabel>
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        <PlannerDonut segments={donutSegments} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.porNaturaleza.map(({ nature, total }) => {
            const navigable = nature && NATURE_NAVIGABLE.has(nature)
            return (
              <div
                key={nature ?? 'null'}
                className={navigable ? 'planner-nav-row' : undefined}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
                onClick={navigable ? () => nav(`/control?mes=${mes}&nature=${nature}&view=apuntes`) : undefined}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: NATURE_COLORS[nature ?? ''] ?? 'var(--ink-4)',
                    }}
                  />
                  <span className="label" style={{ fontSize: 9, color: 'var(--ink-3)' }}>
                    {NATURE_LABELS[nature ?? ''] ?? 'Sin clasificar'}
                  </span>
                </div>
                <span className="num planner-nav-amount" style={{ fontSize: 13 }}>
                  {fmtAmount(total)}
                </span>
              </div>
            )
          })}
          {data.superObservado != null && (
            <div
              className="planner-nav-row"
              style={{
                marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--rule-2)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              }}
              onClick={() => nav(`/control?mes=${mes}&view=apuntes`)}
            >
              <span className="roman" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                Supermercado
              </span>
              <span className="num planner-nav-amount" style={{ fontSize: 13 }}>
                {fmtAmount(data.superObservado)}
              </span>
            </div>
          )}
          {mounted && fijosDeclarados != null && (
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <span className="roman" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                Fijos declarados
              </span>
              <span className="num" style={{ fontSize: 13 }}>{fmtAmount(fijosDeclarados)}</span>
            </div>
          )}
        </div>
      </div>

      <Hairline />

      {/* ── Sección 4: Comparativa 3m ── */}
      <SectionLabel>Comparativa 3 meses</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <PlannerBarCompare
          label="Consumo"
          value={data.consumo}
          baseline={data.baseline.consumo}
        />
        <PlannerBarCompare
          label="Supermercado"
          value={data.superObservado ?? 0}
          baseline={data.baseline.superObservado}
        />
        <PlannerBarCompare
          label="Gastos fijos observados"
          value={data.fijosObservados}
          baseline={data.baseline.fijosObservados}
        />
        <PlannerBarCompare
          label="Inversiones"
          value={data.inversiones}
          baseline={data.baseline.inversiones}
        />
        <PlannerBarCompare
          label="Maristas"
          value={data.maristas}
          baseline={data.baseline.maristas}
        />
      </div>

      <Hairline />

      {/* ── Sección 5: Narrativa ── */}
      <PlannerNarrative
        data={data}
        incomeExpected={incomeExpected}
        fijosDeclarados={fijosDeclarados}
        mounted={mounted}
      />

      <Hairline />

      {/* ── Sección 6: Tendencia (serie observada, 6 meses anteriores) ── */}
      {/* DIN-1: orden de tarjetas fijo por diseño, no por score de relevancia */}
      <SectionLabel>Tendencia 6 meses</SectionLabel>
      <PlannerGrid>
        <div className="card" style={{ padding: '20px 24px' }}>
          <PlannerTrend
            series={data.tendencia.consumo}
            label="Consumo"
            color="var(--signal-neg)"
          />
        </div>
        <div className="card" style={{ padding: '20px 24px' }}>
          {/* signed=true: barras positivas (verde) y negativas (rojo) para remanente */}
          <PlannerTrend
            series={data.tendencia.remanente}
            label="Remanente"
            signed
          />
        </div>
        <div className="card" style={{ padding: '20px 24px' }}>
          <PlannerTrend
            series={data.tendencia.superObservado}
            label="Supermercado"
            color="var(--signal-neg)"
          />
        </div>
        <div className="card" style={{ padding: '20px 24px' }}>
          <PlannerTrend
            series={data.tendencia.fijosObservados}
            label="Gastos fijos observados"
            color="var(--ink-3)"
          />
        </div>
      </PlannerGrid>

      <Hairline />

      {/* ── Sección 7: Asesor IA (contenedor reservado, vacío) ── */}
      <AdvisorSlot />
    </div>
  )
}
