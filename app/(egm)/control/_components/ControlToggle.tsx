'use client'
import Link from 'next/link'

interface Props {
  pendientes: number
  total: number
  active: 'pendientes' | 'todas'
}

export function ControlToggle({ pendientes, total, active }: Props) {
  const itemStyle = (key: 'pendientes' | 'todas'): React.CSSProperties => ({
    display: 'inline-block',
    textDecoration: 'none',
    padding: '0 0 4px',
    fontFamily: 'var(--sans)',
    fontSize: 13,
    fontWeight: 500,
    letterSpacing: '0.04em',
    color: active === key ? 'var(--ink)' : 'var(--ink-3)',
    borderBottom: active === key ? '1px solid var(--ink)' : '1px solid transparent',
    transition: 'color .15s, border-color .15s',
  })

  return (
    <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
      <Link prefetch href="?filter=pendientes&page=1" style={itemStyle('pendientes')}>
        Pendientes · <span className="num" style={{ fontSize: 13 }}>{pendientes}</span>
      </Link>
      <Link prefetch href="?filter=todas&page=1" style={itemStyle('todas')}>
        Todas · <span className="num" style={{ fontSize: 13 }}>{total}</span>
      </Link>
    </div>
  )
}
