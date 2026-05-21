import React from 'react'

interface ToggleProps {
  on?: boolean
  onChange?: (next: boolean) => void
  label?: string
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({ on, onChange, label, disabled, className, style }, ref) => {
    const track: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      width: 36,
      height: 20,
      padding: 2,
      background: on ? 'var(--ink)' : 'var(--rule)',
      border: '1px solid ' + (on ? 'var(--ink)' : 'var(--rule)'),
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      transition: 'background 0.15s, border-color 0.15s',
      flexShrink: 0,
    }
    const thumb: React.CSSProperties = {
      width: 14,
      height: 14,
      background: on ? 'var(--bg)' : 'var(--ink-3)',
      transform: on ? 'translateX(16px)' : 'translateX(0)',
      transition: 'transform 0.15s, background 0.15s',
    }

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange?.(!on)}
        className={className}
        style={{ ...track, ...style }}
      >
        <span style={thumb} />
      </button>
    )
  }
)
Toggle.displayName = 'Toggle'

export default Toggle
