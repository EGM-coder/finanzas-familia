'use client'
import { useState } from 'react'
import type { DetalleRow, HoldingRow, ManualHoldingRow } from '../page'

type Props = {
  accountId:       string
  detalleRows:     DetalleRow[]
  holdings:        HoldingRow[]
  manualHoldings:  ManualHoldingRow[]
  onSelectPosition: (holdingId: string, positionName: string) => void
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(n))
}

function fmtQty(n: number): string {
  if (n === Math.floor(n)) return n.toLocaleString('es-ES')
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

function fmtPrice(n: number): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function shortDate(iso: string): string {
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)}-${months[parseInt(m) - 1]}-${y.slice(2)}`
}

const VIS_LABEL: Record<string, string> = {
  privada_eric: 'privada Eric',
  privada_ana:  'privada Ana',
  compartida:   'compartida',
}

export function CuentaView({ accountId, detalleRows, holdings, manualHoldings, onSelectPosition }: Props) {
  const [expanded, setExpanded] = useState(false)

  const acctSegmentos = detalleRows.filter(r => r.account_id === accountId)
  const acctInfo      = acctSegmentos[0]
  const saldo         = acctSegmentos.reduce((s, r) => s + r.valor, 0)

  const positions = holdings
    .filter(h => h.account_id === accountId)
    .filter(h => (h.current_value_eur ?? 0) > 0.005)
    .sort((a, b) => (b.current_value_eur ?? 0) - (a.current_value_eur ?? 0))

  const manuals = manualHoldings.filter(m => m.account_id === accountId)

  const COLLAPSE_AT = 4
  const shownPositions = expanded || positions.length <= COLLAPSE_AT
    ? positions
    : positions.slice(0, 2)
  const hiddenPositions = expanded ? [] : positions.slice(2)
  const hiddenValue = hiddenPositions.reduce((s, h) => s + (h.current_value_eur ?? 0), 0)

  return (
    <div className="fade">
      {/* Account header */}
      <div style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 3 }}>
          {acctInfo?.institution ?? '—'}
        </div>
        <div className="num" style={{ fontSize: 28 }}>{fmt(saldo)} €</div>
        {acctInfo && (
          <div className="roman" style={{ fontSize: 11, marginTop: 3 }}>
            {VIS_LABEL[acctInfo.visibility] ?? acctInfo.visibility}
          </div>
        )}
      </div>

      {/* Positions */}
      {positions.length === 0 && manuals.length === 0 ? (
        <div className="roman" style={{ fontSize: 13, color: 'var(--ink-4)' }}>
          Sin posiciones registradas
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shownPositions.map((h, i) => (
            <PositionRow
              key={h.id}
              holding={h}
              idx={i}
              onClick={() => onSelectPosition(h.id, h.ticker ?? h.name)}
            />
          ))}

          {/* Collapsed stub */}
          {!expanded && hiddenPositions.length > 0 && (
            <div
              onClick={() => setExpanded(true)}
              className="egm-row-clickable"
              style={{
                display:    'flex', justifyContent: 'space-between', alignItems: 'center',
                padding:    '11px 8px',
                borderTop:  '1px solid var(--rule-2)',
                cursor:     'pointer',
              }}
            >
              <span className="roman" style={{ fontSize: 12 }}>
                +{hiddenPositions.length} posiciones · {fmt(hiddenValue)} € — ver
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>∨</span>
            </div>
          )}

          {/* Manual holdings (roboadvisor) */}
          {manuals.map((m, i) => (
            <div
              key={m.id}
              style={{
                display:       'grid',
                gridTemplateColumns: '1fr auto',
                alignItems:    'center',
                gap:           12,
                padding:       '12px 8px',
                borderTop:     (positions.length > 0 || i > 0) ? '1px solid var(--rule-2)' : undefined,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                <div className="roman" style={{ fontSize: 11 }}>
                  {m.asset_type} · actualizado {shortDate(m.last_update_date)}
                </div>
              </div>
              <span className="num" style={{ fontSize: 13 }}>{fmt(m.current_value_eur)} €</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PositionRow({ holding: h, idx, onClick }: {
  holding: HoldingRow; idx: number; onClick: () => void
}) {
  const hasHistory = h.current_price_eur != null
  return (
    <div
      onClick={hasHistory ? onClick : undefined}
      className={hasHistory ? 'egm-row-clickable' : undefined}
      style={{
        display:             'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems:          'center',
        gap:                 12,
        padding:             '11px 8px',
        borderTop:           idx > 0 ? '1px solid var(--rule-2)' : undefined,
        cursor:              hasHistory ? 'pointer' : 'default',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {h.ticker ?? h.name}
        </div>
        {h.current_price_eur != null ? (
          <div className="roman" style={{ fontSize: 11 }}>
            {fmtQty(h.quantity)} × {fmtPrice(h.current_price_eur)} €
          </div>
        ) : (
          <div className="roman" style={{ fontSize: 11 }}>
            {fmtQty(h.quantity)} · sin precio reciente
          </div>
        )}
      </div>
      <span className="num" style={{ fontSize: 13 }}>
        {h.current_value_eur != null ? `${fmt(h.current_value_eur)} €` : '—'}
      </span>
      {hasHistory && <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>›</span>}
    </div>
  )
}
