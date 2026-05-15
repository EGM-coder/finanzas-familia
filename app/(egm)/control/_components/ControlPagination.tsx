'use client'
import Link from 'next/link'

interface Props {
  page: number
  totalPages: number
  total: number
  filter: 'pendientes' | 'todas'
}

export function ControlPagination({ page, totalPages, total, filter }: Props) {
  const activeBtnStyle: React.CSSProperties = {
    fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 500,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '8px 14px', background: 'transparent',
    border: '1px solid var(--rule)',
    color: 'var(--ink-3)',
    display: 'inline-block', textDecoration: 'none',
    transition: 'all .15s',
  }

  const disabledBtnStyle: React.CSSProperties = {
    ...activeBtnStyle,
    color: 'var(--ink-4)',
    cursor: 'not-allowed',
    opacity: 0.6,
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center', marginTop: 12, paddingTop: 16,
      borderTop: '1px solid var(--rule)',
    }}>
      <div>
        {page > 1
          ? <Link prefetch href={`?filter=${filter}&page=${page - 1}`} style={activeBtnStyle}>← Anterior</Link>
          : <span style={disabledBtnStyle}>← Anterior</span>
        }
      </div>

      <div className="roman" style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center' }}>
        Página {page} de {totalPages} · {total} registros
      </div>

      <div style={{ textAlign: 'right' }}>
        {page < totalPages
          ? <Link prefetch href={`?filter=${filter}&page=${page + 1}`} style={activeBtnStyle}>Siguiente →</Link>
          : <span style={disabledBtnStyle}>Siguiente →</span>
        }
      </div>
    </div>
  )
}
