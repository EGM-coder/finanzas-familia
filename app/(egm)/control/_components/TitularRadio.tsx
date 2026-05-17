'use client'

export type TitularValue = 'eric' | 'ana' | 'compartido'

const OPTIONS: { value: TitularValue; label: string }[] = [
  { value: 'eric',        label: 'Eric' },
  { value: 'ana',         label: 'Ana' },
  { value: 'compartido',  label: 'Compartido' },
]

interface Props {
  value: TitularValue
  onChange: (v: TitularValue) => void
}

export function TitularRadio({ value, onChange }: Props) {
  function handleKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = OPTIONS[(idx + 1) % OPTIONS.length]
      onChange(next.value)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prev = OPTIONS[(idx - 1 + OPTIONS.length) % OPTIONS.length]
      onChange(prev.value)
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Titular"
      style={{ display: 'flex', gap: 24, alignItems: 'center', height: 40 }}
    >
      {OPTIONS.map((opt, idx) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            onKeyDown={e => handleKeyDown(e, idx)}
            onMouseEnter={e => {
              if (!active) e.currentTarget.style.color = 'var(--ink-2)'
            }}
            onMouseLeave={e => {
              if (!active) e.currentTarget.style.color = 'var(--ink-3)'
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px 0',
              fontFamily: 'var(--sans)',
              fontSize: 14,
              color: active ? 'var(--ink-1)' : 'var(--ink-3)',
              textDecoration: active ? 'underline' : 'none',
              textUnderlineOffset: 4,
              textDecorationThickness: 1,
              cursor: active ? 'default' : 'pointer',
              transition: 'color 150ms ease',
              outline: 'none',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
