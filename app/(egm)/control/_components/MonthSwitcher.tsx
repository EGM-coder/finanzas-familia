'use client'
import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

interface Props {
  mes: string // 'YYYY-MM'
}

export function MonthSwitcher({ mes }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [year, month] = mes.split('-').map(Number)

  // Close popover on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function navigate(y: number, m: number) {
    router.push(`?mes=${y}-${String(m).padStart(2, '0')}`, { scroll: false })
    setOpen(false)
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
      <button type="button" onClick={prev} style={navBtnStyle} aria-label="Mes anterior">‹</button>

      {/* Month name — clic → popover rejilla 12 meses */}
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          aria-expanded={open}
          aria-label="Elegir mes"
        >
          <span className="display-it" style={{ fontSize: 24 }}>
            {MONTHS[month - 1]} {year}
          </span>
        </button>

        {open && (
          <div
            role="listbox"
            aria-label="Meses del año"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--paper)',
              border: '1px solid var(--rule)',
              padding: 10,
              zIndex: 50,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 3,
              minWidth: 210,
            }}
          >
            {MONTHS.map((name, i) => {
              const mNum = i + 1
              const isActive = mNum === month
              return (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => navigate(year, mNum)}
                  style={{
                    background: 'none',
                    border: isActive ? '1px solid var(--ink)' : '1px solid transparent',
                    cursor: 'pointer',
                    padding: '6px 4px',
                    fontFamily: 'var(--sans)',
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    color: isActive ? 'var(--ink)' : 'var(--ink-3)',
                    fontWeight: isActive ? 500 : 400,
                    textAlign: 'center',
                  }}
                >
                  {name.slice(0, 3)}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <button type="button" onClick={next} style={navBtnStyle} aria-label="Mes siguiente">›</button>
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
