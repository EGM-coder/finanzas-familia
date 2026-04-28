'use client'

import { useState } from 'react'
import type { PatrimonioNetoRow, SnapshotDeltaRow } from '@/types/cuentas'
import type { HistoryPoint } from '@/app/hooks/usePatrimonioHistory'
import DeltaIndicator from '@/app/components/DeltaIndicator'
import Sparkline from '@/app/components/Sparkline'

const C = {
  bg:        '#F7F4ED',
  text:      '#2A2822',
  secondary: '#5A5449',
  border:    '#DDD7C7',
  accent:    '#4C5844',
  negative:  '#A05C3E',
  surface:   '#FFFFFF',
}

function fmtEur(n: number, visible: boolean, decimals = 0): string {
  if (!visible) return '•••'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

interface Props {
  data: PatrimonioNetoRow
  visible: boolean
  snapshotDelta?: SnapshotDeltaRow | null
  history?: HistoryPoint[]
}

export default function PatrimonioNetoCard({ data, visible, snapshotDelta, history = [] }: Props) {
  const [open, setOpen] = useState(false)

  const {
    liquidos_y_holdings,
    inmuebles,
    activos_total,
    deudas_activas,
    deudas_proyectadas,
    patrimonio_neto_actual,
    patrimonio_neto_si_firmara_hoy,
  } = data

  const breakdown = [
    { label: 'Líquidos y holdings',  value: liquidos_y_holdings,  negative: false },
    { label: 'Inmuebles',            value: inmuebles,             negative: false },
    { label: 'Total activos',        value: activos_total,         negative: false, bold: true },
    { label: 'Deudas activas',       value: -deudas_activas,       negative: true },
    { label: 'Deudas proyectadas',   value: -deudas_proyectadas,   negative: true },
  ]

  return (
    <div style={{
      background: C.surface, borderRadius: 10,
      border: `1px solid ${C.border}`, overflow: 'hidden',
      margin: '0 16px',
    }}>
      {/* Cifra principal */}
      <div style={{ padding: '16px 16px 12px' }}>
        <div style={{ fontSize: 11, color: C.secondary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          Patrimonio neto
        </div>
        <div style={{
          fontFamily: 'Georgia, serif', fontSize: 34, fontWeight: 400, lineHeight: 1.1,
          fontFeatureSettings: "'tnum'",
          color: patrimonio_neto_actual >= 0 ? C.text : C.negative,
        }}>
          {fmtEur(patrimonio_neto_actual, visible)}
        </div>

        {/* Delta 30d + sparkline */}
        {snapshotDelta && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <DeltaIndicator
              delta={snapshotDelta.delta_neto_actual}
              pct={snapshotDelta.delta_neto_actual_pct}
              visible={visible}
            />
            {visible && <Sparkline points={history} />}
          </div>
        )}

        {/* Si firmaras hoy */}
        <div style={{ marginTop: 8, fontSize: 12, color: C.secondary }}>
          Si firmaras la hipoteca hoy&nbsp;
          <span style={{
            fontFeatureSettings: "'tnum'",
            color: patrimonio_neto_si_firmara_hoy >= 0 ? C.secondary : C.negative,
          }}>
            {fmtEur(patrimonio_neto_si_firmara_hoy, visible)}
          </span>
        </div>

        {/* Nota al pie */}
        <div style={{ marginTop: 4, fontSize: 10, color: C.secondary, fontStyle: 'italic' }}>
          aproximación, no incluye gastos de escritura
        </div>
      </div>

      {/* Toggle breakdown */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 16px', background: 'none', border: 'none',
          borderTop: `1px solid ${C.border}`, cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 11, color: C.secondary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Desglose
        </span>
        <span style={{
          color: C.secondary, fontSize: 16, lineHeight: 1,
          display: 'inline-block',
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.18s ease',
        }}>›</span>
      </button>

      {/* Breakdown colapsable */}
      {open && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {breakdown.map(row => (
            <div key={row.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '7px 16px',
              borderTop: `1px solid ${C.border}`,
            }}>
              <span style={{
                fontSize: 12,
                color: C.secondary,
                fontWeight: (row as { bold?: boolean }).bold ? 500 : 400,
              }}>
                {row.label}
              </span>
              <span style={{
                fontSize: 12, fontFeatureSettings: "'tnum'",
                color: row.negative ? C.negative : C.text,
                fontWeight: (row as { bold?: boolean }).bold ? 500 : 400,
              }}>
                {fmtEur(row.value, visible, 2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
