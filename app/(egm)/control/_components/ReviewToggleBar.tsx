'use client'

export type FilterModo = 'todas' | 'pendientes' | 'sin_clasificar'

interface Props {
  count: number
  countSinClasificar: number
  modo: FilterModo
  onChange: (m: FilterModo) => void
}

export function ReviewToggleBar({ count, countSinClasificar, modo, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
      {/* Sin clasificar — predicate = fn_close_week: category_id IS NULL AND amount<0 */}
      <button
        type="button"
        onClick={() => onChange('sin_clasificar')}
        style={itemStyle(modo === 'sin_clasificar', countSinClasificar > 0)}
      >
        Sin clasificar ·{' '}
        <span className="num" style={{ fontSize: 13 }}>
          {countSinClasificar}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange('pendientes')}
        style={itemStyle(modo === 'pendientes', false)}
      >
        Por revisar ·{' '}
        <span className="num" style={{ fontSize: 13 }}>
          {count}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange('todas')}
        style={itemStyle(modo === 'todas', false)}
      >
        Todas
      </button>
    </div>
  )
}

const itemStyle = (active: boolean, warn: boolean): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  borderBottom: active ? '1px solid var(--ink)' : '1px solid transparent',
  padding: '0 0 4px',
  fontFamily: 'var(--sans)',
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: '0.04em',
  color: active ? 'var(--ink)' : warn ? 'var(--signal-warn)' : 'var(--ink-3)',
  cursor: 'pointer',
  transition: 'color .15s, border-color .15s',
})
