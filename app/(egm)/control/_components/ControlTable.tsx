'use client'
import { fmtDate, fmtAmount } from '../../_lib/formatters'

interface Category {
  id: string
  name: string
  color: string | null
  parent_id: string | null
}

export interface Row {
  id: string
  date: string
  description: string | null
  counterparty: string | null
  raw_concept: string | null
  amount: number
  currency: string
  category_id: string | null
  project_id: string | null
  nature: string | null
  titular: string | null
  is_reimbursable: boolean | null
  accounts: { institution: string; name: string } | null
  categories: Category | null
  projects: { id: string; name: string } | null
}

interface Props {
  rows: Row[]
  onRowClick?: (row: Row) => void
  removedIds?: Set<string>
}

function CategoryCell({ cat }: { cat: Category | null }) {
  if (!cat) {
    return (
      <span className="roman" style={{ fontSize: 12, color: 'var(--ink-4)', fontStyle: 'italic' }}>
        sin categorizar
      </span>
    )
  }
  // TODO: heredar color del padre cuando haya txns categorizadas (hijo cat.parent_id != null)
  const dotColor = cat.color ?? 'var(--ink-4)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: dotColor, flexShrink: 0,
      }} />
      <span style={{ fontSize: 12 }}>{cat.name}</span>
    </span>
  )
}

const COL_STYLES: React.CSSProperties[] = [
  { width: 90,  flexShrink: 0 },                        // FECHA
  { flex: 1,    minWidth: 0 },                           // DESCRIPCIÓN
  { width: 160, flexShrink: 0 },                         // CUENTA
  { width: 60,  flexShrink: 0 },                         // TITULAR
  { width: 140, flexShrink: 0 },                         // CATEGORÍA
  { width: 100, flexShrink: 0, textAlign: 'right' },     // MONTO
]

const HEADERS = ['FECHA', 'DESCRIPCIÓN', 'CUENTA', 'TITULAR', 'CATEGORÍA', 'MONTO']

export function ControlTable({ rows, onRowClick, removedIds }: Props) {
  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{
        display: 'flex', gap: 16,
        padding: '0 0 8px',
        borderBottom: '1px solid var(--ink)',
      }}>
        {HEADERS.map((h, i) => (
          <div key={h} className="label" style={{ ...COL_STYLES[i], fontSize: 10 }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      {rows.map((row) => {
        const isRemoving = removedIds?.has(row.id) ?? false
        return (
        <div
          key={row.id}
          onClick={onRowClick && !isRemoving ? () => onRowClick(row) : undefined}
          aria-hidden={isRemoving || undefined}
          className={[
            onRowClick ? 'egm-row-clickable' : '',
            isRemoving ? 'egm-row-removing' : '',
          ].filter(Boolean).join(' ') || undefined}
          style={{
            display: 'flex', gap: 16, alignItems: 'center',
            padding: '14px 0',
            borderBottom: '1px solid var(--rule-2)',
          }}
        >
          {/* Fecha */}
          <div className="num" style={{ ...COL_STYLES[0], fontSize: 12, color: 'var(--ink-3)' }}>
            {fmtDate(row.date)}
          </div>

          {/* Descripción */}
          <div style={{ ...COL_STYLES[1], overflow: 'hidden' }}>
            <div style={{
              fontSize: 13, fontWeight: 500,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {row.description ?? '—'}
            </div>
            {row.accounts && (
              <div className="roman" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                {row.accounts.institution} · {row.accounts.name}
              </div>
            )}
          </div>

          {/* Cuenta — vacío; ya dentro de Descripción como subtítulo */}
          <div style={COL_STYLES[2]} />

          {/* Titular */}
          <div style={{
            ...COL_STYLES[3],
            fontSize: 10, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--ink-3)',
          }}>
            {row.titular ?? '—'}
          </div>

          {/* Categoría */}
          <div style={COL_STYLES[4]}>
            <CategoryCell cat={row.categories} />
          </div>

          {/* Monto */}
          <div
            className={`num ${row.amount > 0 ? 'pos' : 'neg'}`}
            style={{ ...COL_STYLES[5], fontSize: 13, fontWeight: 500 }}
          >
            {fmtAmount(row.amount, row.currency)}
          </div>
        </div>
      )})}
    </div>
  )
}
