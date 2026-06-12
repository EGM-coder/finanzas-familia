'use client'
import { useState } from 'react'
import type { DetalleRow, HoldingRow, ManualHoldingRow, TxRow } from '../page'

type Props = {
  accountId:       string
  detalleRows:     DetalleRow[]
  holdings:        HoldingRow[]
  manualHoldings:  ManualHoldingRow[]
  txnsByAccount:   Record<string, TxRow[]>
  onSelectPosition: (holdingId: string, positionName: string) => void
}

// ── Formatters ────────────────────────────────────────────────────

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

function fmtAmount(n: number): string {
  const sign = n < 0 ? '−' : '+'
  return `${sign}${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n))}`
}

function txDate(iso: string): string {
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const [y, m, d] = iso.split('-')
  const thisYear = new Date().getFullYear().toString().slice(-2)
  if (y.slice(-2) === thisYear) return `${parseInt(d)} ${months[parseInt(m) - 1]}`
  return `${parseInt(d)}-${months[parseInt(m) - 1]}-${y.slice(2)}`
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

const INITIAL_LIMIT = 30

// ── Position row ──────────────────────────────────────────────────

function PositionRow({ holding: h, idx, onClick }: {
  holding: HoldingRow; idx: number; onClick: () => void
}) {
  const hasPrice = h.current_price_eur != null
  return (
    <div
      onClick={hasPrice ? onClick : undefined}
      className={hasPrice ? 'egm-row-clickable' : undefined}
      style={{
        display:             'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems:          'center',
        gap:                 12,
        padding:             '11px 8px',
        borderTop:           idx > 0 ? '1px solid var(--rule-2)' : undefined,
        cursor:              hasPrice ? 'pointer' : 'default',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {h.ticker ?? h.name}
        </div>
        {hasPrice ? (
          <div className="roman" style={{ fontSize: 11 }}>
            {fmtQty(h.quantity)} × {fmtPrice(h.current_price_eur!)} €
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
      {hasPrice && <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>›</span>}
    </div>
  )
}

// ── Movement row ──────────────────────────────────────────────────

function MovementRow({ t, idx }: { t: TxRow; idx: number }) {
  const label        = t.description?.trim() || t.counterparty?.trim() || '—'
  const isTransfer   = t.nature === 'transferencia'
  const textColor    = isTransfer ? 'var(--ink-4)' : 'var(--ink-2)'

  return (
    <div
      style={{
        display:       'grid',
        gridTemplateColumns: '52px 1fr auto',
        alignItems:    'baseline',
        gap:           10,
        padding:       '9px 8px',
        borderTop:     idx > 0 ? '1px solid var(--rule-2)' : undefined,
        opacity:       isTransfer ? 0.6 : 1,
      }}
    >
      {/* Date */}
      <span className="roman" style={{ fontSize: 11, color: 'var(--ink-4)', flexShrink: 0 }}>
        {txDate(t.date)}
      </span>

      {/* Label (+ transferencia badge) */}
      <span style={{ fontSize: 12, color: textColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
        {isTransfer && (
          <span className="roman" style={{ fontSize: 10, marginLeft: 5, color: 'var(--ink-4)' }}>
            transferencia
          </span>
        )}
      </span>

      {/* Amount — monocromo */}
      <span
        className="num"
        style={{ fontSize: 12, color: 'var(--ink-2)', flexShrink: 0 }}
      >
        {fmtAmount(t.amount)} €
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────

export function CuentaView({ accountId, detalleRows, holdings, manualHoldings, txnsByAccount, onSelectPosition }: Props) {
  const [posExpanded,  setPosExpanded]  = useState(false)
  const [txnShowAll,   setTxnShowAll]   = useState(false)

  const acctSegmentos = detalleRows.filter(r => r.account_id === accountId)
  const acctInfo      = acctSegmentos[0]
  const saldo         = acctSegmentos.reduce((s, r) => s + r.valor, 0)

  const positions = holdings
    .filter(h => h.account_id === accountId)
    .filter(h => (h.current_value_eur ?? 0) > 0.005)
    .sort((a, b) => (b.current_value_eur ?? 0) - (a.current_value_eur ?? 0))

  const manuals = manualHoldings.filter(m => m.account_id === accountId)

  const txns = txnsByAccount[accountId] ?? []  // already date DESC from server

  const hasPosiciones = positions.length > 0 || manuals.length > 0

  // ── Account header (shared across all modes) ───────────────────
  const header = (
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
  )

  // ── MODO: posiciones (holdings o roboadvisor) ──────────────────
  if (hasPosiciones) {
    const COLLAPSE_AT = 4
    const shownPositions = posExpanded || positions.length <= COLLAPSE_AT
      ? positions
      : positions.slice(0, 2)
    const hiddenPositions = (posExpanded || positions.length <= COLLAPSE_AT)
      ? []
      : positions.slice(2)
    const hiddenValue = hiddenPositions.reduce((s, h) => s + (h.current_value_eur ?? 0), 0)

    return (
      <div className="fade">
        {header}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shownPositions.map((h, i) => (
            <PositionRow
              key={h.id}
              holding={h}
              idx={i}
              onClick={() => onSelectPosition(h.id, h.ticker ?? h.name)}
            />
          ))}

          {!posExpanded && hiddenPositions.length > 0 && (
            <div
              onClick={() => setPosExpanded(true)}
              className="egm-row-clickable"
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '11px 8px', borderTop: '1px solid var(--rule-2)', cursor: 'pointer',
              }}
            >
              <span className="roman" style={{ fontSize: 12 }}>
                +{hiddenPositions.length} posiciones · {fmt(hiddenValue)} € — ver
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>∨</span>
            </div>
          )}

          {manuals.map((m, i) => (
            <div
              key={m.id}
              style={{
                display: 'grid', gridTemplateColumns: '1fr auto',
                alignItems: 'center', gap: 12,
                padding: '12px 8px',
                borderTop: (positions.length > 0 || i > 0) ? '1px solid var(--rule-2)' : undefined,
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
      </div>
    )
  }

  // ── MODO: movimientos (cuenta de efectivo) ─────────────────────
  if (txns.length > 0) {
    const shownTxns = txnShowAll ? txns : txns.slice(0, INITIAL_LIMIT)
    const hiddenCount = txns.length - INITIAL_LIMIT

    return (
      <div className="fade">
        {header}
        <div className="label" style={{ fontSize: 9, marginBottom: 8 }}>Movimientos</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shownTxns.map((t, i) => (
            <MovementRow key={`${t.date}-${i}`} t={t} idx={i} />
          ))}
        </div>
        {!txnShowAll && hiddenCount > 0 && (
          <button
            onClick={() => setTxnShowAll(true)}
            className="btn btn-ghost"
            style={{ marginTop: 12, padding: '6px 16px', fontSize: 10, width: '100%' }}
          >
            Ver {hiddenCount} más
          </button>
        )}
      </div>
    )
  }

  // ── MODO: vacío ───────────────────────────────────────────────
  return (
    <div className="fade">
      {header}
      <div className="roman" style={{ fontSize: 13, color: 'var(--ink-4)' }}>
        Sin movimientos
      </div>
    </div>
  )
}
