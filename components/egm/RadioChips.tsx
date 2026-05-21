import React from 'react'

export interface RadioOption {
  value: string
  label: string
  disabled?: boolean
}

interface RadioChipsProps {
  options: RadioOption[]
  active?: string
  onChange?: (value: string) => void
  className?: string
  style?: React.CSSProperties
}

const RadioChips = React.forwardRef<HTMLDivElement, RadioChipsProps>(
  ({ options, active, onChange, className, style }, ref) => {
    return (
      <div
        ref={ref}
        role="radiogroup"
        className={className}
        style={{ display: 'flex', gap: 0, ...style }}
      >
        {options.map((opt) => {
          const isActive = opt.value === active
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={opt.disabled}
              onClick={() => !opt.disabled && onChange?.(opt.value)}
              className="label"
              style={{
                padding: '8px 14px',
                border: '1px solid ' + (isActive ? 'var(--ink)' : 'var(--rule)'),
                marginRight: -1,
                background: isActive ? 'var(--ink)' : 'transparent',
                color: isActive ? 'var(--bg)' : 'var(--ink-3)',
                cursor: opt.disabled ? 'not-allowed' : 'pointer',
                opacity: opt.disabled ? 0.4 : 1,
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                position: 'relative',
                zIndex: isActive ? 1 : 0,
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    )
  }
)
RadioChips.displayName = 'RadioChips'

export default RadioChips
