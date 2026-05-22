import React from 'react'

interface ColorSwatchProps {
  hex?: string | null
  size?: number
  style?: React.CSSProperties
}

export function ColorSwatch({ hex, size = 14, style }: ColorSwatchProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        background: hex ?? 'var(--rule)',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}

export default ColorSwatch
