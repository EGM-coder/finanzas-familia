'use client'
import { useRouter } from 'next/navigation'

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

interface Props {
  mes: string // 'YYYY-MM'
}

export function MonthSwitcher({ mes }: Props) {
  const router = useRouter()
  const [year, month] = mes.split('-').map(Number)

  function navigate(y: number, m: number) {
    router.push(`?mes=${y}-${String(m).padStart(2, '0')}`)
  }

  function prev() {
    if (month === 1) navigate(year - 1, 12)
    else navigate(year, month - 1)
  }

  function next() {
    if (month === 12) navigate(year + 1, 1)
    else navigate(year, month + 1)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 32 }}>
      <button type="button" onClick={prev} style={navBtnStyle}>‹</button>
      <span className="display-it" style={{ fontSize: 24 }}>
        {MONTHS[month - 1]} {year}
      </span>
      <button type="button" onClick={next} style={navBtnStyle}>›</button>
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 20,
  color: 'var(--ink-3)',
  padding: '0 4px',
  lineHeight: 1,
}
