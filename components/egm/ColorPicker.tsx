'use client'
import React from 'react'

// Paleta editorial EGMFin — desaturada, sin neones, sin gradientes
export const EGM_PALETTE = [
  '#6b4f3a', '#7a5c2e', '#4a6a4a', '#3a5d7a', '#5a4a7a',
  '#7a3a3a', '#3a6a6a', '#6a6a3a', '#5a5a6a', '#7a4a5a',
  '#4a5a3a', '#6a4a3a', '#3a4a6a', '#7a6a3a', '#4a7a4a',
  '#6a3a5a', '#3d5c3d', '#4a3d5c', '#5c4a3d', '#3d4a5c',
]

interface ColorPickerProps {
  value?: string | null
  onChange: (hex: string) => void
  existingHexes?: string[]
}

export function ColorPicker({ value, onChange, existingHexes = [] }: ColorPickerProps) {
  const usedSet = new Set(existingHexes.map((h) => h.toLowerCase()))

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: '10px 0',
        }}
      >
        {EGM_PALETTE.map((hex) => {
          const isActive = value?.toLowerCase() === hex.toLowerCase()
          const isUsed = usedSet.has(hex.toLowerCase()) && !isActive

          return (
            <button
              key={hex}
              type="button"
              title={isUsed ? `${hex} · en uso` : hex}
              onClick={() => onChange(hex)}
              style={{
                width: 22,
                height: 22,
                background: hex,
                border: isActive
                  ? '2px solid var(--ink)'
                  : '2px solid transparent',
                outline: isActive ? '1px solid var(--bg)' : 'none',
                outlineOffset: -3,
                cursor: 'pointer',
                opacity: isUsed ? 0.35 : 1,
                position: 'relative',
              }}
            />
          )
        })}
      </div>
      {value && (
        <div
          className="label"
          style={{ fontSize: 9, color: 'var(--ink-4)', marginTop: 2, letterSpacing: '0.1em' }}
        >
          {value}
          {usedSet.has(value.toLowerCase()) && ' · en uso por otra categoría'}
        </div>
      )}
    </div>
  )
}

export default ColorPicker
