'use client'
import { useEffect } from 'react'
import { fmtAmount } from '../../_lib/formatters'
import { type Row } from './ControlTable'
import { ReviewBadge } from './ReviewBadge'

export type EnrichedRow = Row & {
  rootColor: string | null
  por_revisar: boolean
}

interface Props {
  rows: EnrichedRow[]
  mes: string
  isCurrentMonth: boolean
  onRowClick?: (row: EnrichedRow) => void
  removedIds?: Set<string>
}

function groupByDay(rows: EnrichedRow[]): Array<{ date: string; rows: EnrichedRow[] }> {
  const map = new Map<string, EnrichedRow[]>()
  for (const row of rows) {
    const existing = map.get(row.date) ?? []
    existing.push(row)
    map.set(row.date, existing)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayRows]) => ({ date, rows: dayRows }))
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DAY_NAMES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const MONTH_NAMES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function fmtDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`
}

export function ControlMonthLedger({ rows, mes, isCurrentMonth, onRowClick, removedIds }: Props) {
  const groups = groupByDay(rows)

  // Scroll to first day group when month changes (not on filter toggle or drawer open/close)
  useEffect(() => {
    const firstDate = groups[0]?.date
    if (!firstDate) return
    const timer = setTimeout(() => {
      document.getElementById(`day-${firstDate}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }, 80)
    return () => clearTimeout(timer)
    // mes is the correct dependency: fires on month change, not on rows refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes])

  if (rows.length === 0) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <div className="display-it" style={{ fontSize: 22 }}>Nada por aquí.</div>
        <div className="roman" style={{ fontSize: 13, marginTop: 8, color: 'var(--ink-3)' }}>
          Sin movimientos que coincidan con este filtro.
        </div>
      </div>
    )
  }

  return (
    <div>
      {isCurrentMonth && <JumpToBar groups={groups} />}
      {groups.map(({ date, rows: dayRows }) => {
        const dayTotal = dayRows.reduce((sum, r) => sum + r.amount, 0)
        return (
          <div key={date} id={`day-${date}`} style={{ scrollMarginTop: 56 }}>
            <DayGroupHeader label={fmtDayLabel(date)} total={dayTotal} />
            {dayRows.map((row) => (
              <LedgerRow
                key={row.id}
                row={row}
                onClick={onRowClick && !removedIds?.has(row.id) ? () => onRowClick(row) : undefined}
                isRemoving={removedIds?.has(row.id) ?? false}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── JumpToBar ─────────────────────────────────────────────────

function JumpToBar({ groups }: { groups: Array<{ date: string }> }) {
  const today = new Date()
  const todayStr = toLocalDateStr(today)
  const yest = new Date(today)
  yest.setDate(today.getDate() - 1)
  const yesterdayStr = toLocalDateStr(yest)

  const hasToday = groups.some((g) => g.date === todayStr)
  const hasYesterday = groups.some((g) => g.date === yesterdayStr)

  if (!hasToday && !hasYesterday) return null

  function scrollTo(date: string) {
    document.getElementById(`day-${date}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
      {hasToday && (
        <button type="button" onClick={() => scrollTo(todayStr)} style={jumpBtnStyle}>
          Hoy
        </button>
      )}
      {hasYesterday && (
        <button type="button" onClick={() => scrollTo(yesterdayStr)} style={jumpBtnStyle}>
          Ayer
        </button>
      )}
    </div>
  )
}

const jumpBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--rule)',
  padding: '3px 10px',
  fontFamily: 'var(--sans)',
  fontSize: 11,
  letterSpacing: '0.08em',
  color: 'var(--ink-3)',
  cursor: 'pointer',
}

// ── DayGroupHeader ────────────────────────────────────────────

function DayGroupHeader({ label, total }: { label: string; total: number }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '18px 0 8px',
        borderTop: '1px solid var(--rule)',
      }}
    >
      <span
        className="roman"
        style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}
      >
        {label}
      </span>
      <span className="num" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
        {fmtAmount(total)}
      </span>
    </div>
  )
}

// ── LedgerRow ─────────────────────────────────────────────────

function LedgerRow({
  row, onClick, isRemoving,
}: {
  row: EnrichedRow
  onClick?: () => void
  isRemoving: boolean
}) {
  const label = row.counterparty
    ?? (row.description ? row.description.slice(0, 60) : '—')

  return (
    <div
      onClick={onClick}
      aria-hidden={isRemoving || undefined}
      className={[
        onClick ? 'egm-row-clickable' : '',
        isRemoving ? 'egm-row-removing' : '',
      ].filter(Boolean).join(' ') || undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 0',
        borderBottom: '1px solid var(--rule-2)',
      }}
    >
      {/* Bullet: 8px · color del padre de la categoría */}
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          flexShrink: 0,
          marginTop: 1,         // alineación óptica con la línea de texto
          background: row.rootColor ?? 'var(--rule)',
        }}
      />

      {/* Contrapartida + PV-3 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: row.categories ? 'var(--ink)' : 'var(--ink-3)',
          }}
        >
          {label}
        </div>
        {/* PV-3: indicador de vinculación a pedido */}
        <div className="roman" style={{ fontSize: 10, marginTop: 1, color: 'var(--ink-4)' }}>
          {row.order_id
            ? `● ${row.purchase_orders?.merchant ?? '—'}`
            : '○ Cargo sin vincular'}
        </div>
      </div>

      {row.por_revisar && <ReviewBadge />}

      {/* Importe */}
      <span
        className={`num ${row.amount > 0 ? 'pos' : 'neg'}`}
        style={{ fontSize: 13, fontWeight: 500, flexShrink: 0 }}
      >
        {fmtAmount(row.amount, row.currency)}
      </span>
    </div>
  )
}
