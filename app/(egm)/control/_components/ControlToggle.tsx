'use client'
import { useRouter, useSearchParams } from 'next/navigation'

interface Props {
  pendientes: number
  total: number
  active: 'pendientes' | 'todas'
}

export function ControlToggle({ pendientes, total, active }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const go = (filter: 'pendientes' | 'todas') => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('filter', filter)
    params.set('page', '1')
    router.push(`/control?${params.toString()}`)
  }

  const itemStyle = (key: 'pendientes' | 'todas'): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    padding: '0 0 4px',
    cursor: 'pointer',
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
      <button style={itemStyle('pendientes')} onClick={() => go('pendientes')}>
        Pendientes · <span className="num" style={{ fontSize: 13 }}>{pendientes}</span>
      </button>
      <button style={itemStyle('todas')} onClick={() => go('todas')}>
        Todas · <span className="num" style={{ fontSize: 13 }}>{total}</span>
      </button>
    </div>
  )
}
