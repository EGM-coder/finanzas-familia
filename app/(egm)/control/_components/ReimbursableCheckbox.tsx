'use client'

interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

export function ReimbursableCheckbox({ checked, onChange, disabled = false }: Props) {
  return (
    <label
      title={disabled ? 'Solo aplicable a Eric' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 40,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        userSelect: 'none',
      }}
    >
      {/* Checkbox custom 16×16 */}
      <span
        role="checkbox"
        aria-checked={checked}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={() => { if (!disabled) onChange(!checked) }}
        onKeyDown={e => {
          if (!disabled && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault()
            onChange(!checked)
          }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          flexShrink: 0,
          border: `1px solid ${disabled ? 'var(--rule-2)' : checked ? 'var(--ink-1)' : 'var(--rule)'}`,
          background: checked ? 'var(--ink-1)' : 'transparent',
          transition: 'background-color 150ms ease, border-color 150ms ease',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        onFocus={e => {
          if (!disabled) e.currentTarget.style.outline = '1px solid var(--ink-2)'
          if (!disabled) e.currentTarget.style.outlineOffset = '2px'
        }}
        onBlur={e => {
          e.currentTarget.style.outline = 'none'
        }}
      >
        {checked && (
          <svg width={10} height={10} viewBox="0 0 10 10" fill="none"
            stroke="var(--paper)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.5 5l2.5 2.5 4.5-4.5" />
          </svg>
        )}
      </span>

      {/* Label */}
      <span style={{
        fontFamily: 'var(--sans)',
        fontSize: 14,
        color: disabled ? 'var(--ink-3)' : 'var(--ink-1)',
        transition: 'color 150ms ease',
      }}>
        Reembolsable Nordex
      </span>
    </label>
  )
}
