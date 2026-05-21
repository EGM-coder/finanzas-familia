import React from 'react'

export interface AvatarChipProps {
  initial: string
  scope?: string
  onClick?: () => void
}

export function AvatarChip({ initial, scope, onClick }: AvatarChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="label"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 10px',
        border: '1px solid var(--rule)',
        background: 'transparent',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          background: 'var(--ink)',
          color: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontFamily: 'var(--sans)',
          fontWeight: 600,
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}
      >
        {initial.toUpperCase()}
      </span>
      {scope && <span>{scope.toUpperCase()}</span>}
    </button>
  )
}

export default AvatarChip
