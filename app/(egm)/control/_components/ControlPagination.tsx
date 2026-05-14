'use client'
import { useRouter, useSearchParams } from 'next/navigation'

interface Props {
  page: number
  totalPages: number
  total: number
}

export function ControlPagination({ page, totalPages, total }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const go = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(newPage))
    router.push(`/control?${params.toString()}`)
  }

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 500,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '8px 14px', background: 'transparent',
    border: '1px solid var(--rule)',
    color: disabled ? 'var(--ink-4)' : 'var(--ink-3)',
    cursor: disabled ? 'default' : 'pointer',
    transition: 'all .15s',
  })

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center', marginTop: 12, paddingTop: 16,
      borderTop: '1px solid var(--rule)',
    }}>
      <div>
        <button
          style={btnStyle(page === 1)}
          disabled={page === 1}
          onClick={() => go(page - 1)}
        >
          ← Anterior
        </button>
      </div>

      <div className="roman" style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center' }}>
        Página {page} de {totalPages} · {total} registros
      </div>

      <div style={{ textAlign: 'right' }}>
        <button
          style={btnStyle(page === totalPages)}
          disabled={page === totalPages}
          onClick={() => go(page + 1)}
        >
          Siguiente →
        </button>
      </div>
    </div>
  )
}
