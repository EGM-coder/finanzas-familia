'use client'

interface Props {
  count: number
  modo: 'todas' | 'pendientes'
  onChange: (m: 'todas' | 'pendientes') => void
}

export function ReviewToggleBar({ count, modo, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
      <button
        type="button"
        onClick={() => onChange('pendientes')}
        style={itemStyle(modo === 'pendientes')}
      >
        Por revisar ·{' '}
        <span className="num" style={{ fontSize: 13 }}>
          {count}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange('todas')}
        style={itemStyle(modo === 'todas')}
      >
        Todas
      </button>
    </div>
  )
}

const itemStyle = (active: boolean): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  borderBottom: active ? '1px solid var(--ink)' : '1px solid transparent',
  padding: '0 0 4px',
  fontFamily: 'var(--sans)',
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: '0.04em',
  color: active ? 'var(--ink)' : 'var(--ink-3)',
  cursor: 'pointer',
  transition: 'color .15s, border-color .15s',
})
