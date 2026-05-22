'use client'
import { fmtAmount } from '../../_lib/formatters'
import { type Row } from './ControlTable'
import { ReviewBadge } from './ReviewBadge'

export type EnrichedRow = Row & {
  rootColor: string | null
  por_revisar: boolean
}

interface Props {
  rows: EnrichedRow[]
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

const DAY_NAMES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const MONTH_NAMES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function fmtDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`
}

export function ControlMonthLedger({ rows, onRowClick, removedIds }: Props) {
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

  const groups = groupByDay(rows)

  return (
    <div>
      {groups.map(({ date, rows: dayRows }) => {
        const dayTotal = dayRows.reduce((sum, r) => sum + r.amount, 0)
        return (
          <div key={date}>
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

function DayGroupHeader({ label, total }: { label: string; total: number }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '20px 0 6px',
        borderTop: '1px solid var(--rule)',
        marginTop: 4,
      }}
    >
      <span className="roman" style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>
        {label}
      </span>
      <span className="num" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
        {fmtAmount(total)}
      </span>
    </div>
  )
}

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
        padding: '10px 0',
        borderBottom: '1px solid var(--rule-2)',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          flexShrink: 0,
          background: row.rootColor ?? 'var(--rule)',
        }}
      />

      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: row.categories ? 'var(--ink)' : 'var(--ink-3)',
        }}
      >
        {label}
      </span>

      {row.por_revisar && <ReviewBadge />}

      <span
        className={`num ${row.amount > 0 ? 'pos' : 'neg'}`}
        style={{ fontSize: 13, fontWeight: 500, flexShrink: 0 }}
      >
        {fmtAmount(row.amount, row.currency)}
      </span>
    </div>
  )
}
