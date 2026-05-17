'use client'

import { useState, useEffect, useRef } from 'react'
import { Command } from 'cmdk'

export type NatureValue =
  | 'fijo_recurrente'
  | 'variable_recurrente'
  | 'extraordinario'
  | 'inversion'
  | 'ahorro'

const NATURE_OPTIONS: { value: NatureValue; label: string }[] = [
  { value: 'fijo_recurrente',     label: 'Fijo · recurrente' },
  { value: 'variable_recurrente', label: 'Variable · recurrente' },
  { value: 'extraordinario',      label: 'Extraordinario' },
  { value: 'inversion',           label: 'Inversión' },
  { value: 'ahorro',              label: 'Ahorro' },
]

interface Props {
  value: NatureValue | null
  onChange: (v: NatureValue | null) => void
}

export function NatureSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Cerrar al click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Esc cierra dropdown sin propagar (no cierra el drawer)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [open])

  const selected = value ? NATURE_OPTIONS.find(o => o.value === value) : null

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--ink-2)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--rule)')}
          style={{
            flex: 1,
            height: 40,
            padding: '0 14px',
            border: '1px solid var(--rule)',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--sans)',
            fontSize: 14,
            color: selected ? 'var(--ink-1)' : 'var(--ink-3)',
            fontStyle: selected ? 'normal' : 'italic',
            borderRadius: 0,
            transition: 'border-color 150ms ease',
            outline: 'none',
          }}
        >
          <span>{selected ? selected.label : 'Sin clasificar'}</span>
          <svg
            width={12} height={12} viewBox="0 0 12 12"
            fill="none" stroke="currentColor"
            strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
            style={{
              color: 'var(--ink-3)',
              flexShrink: 0,
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 200ms ease',
            }}
          >
            <path d="M2 4l4 4 4-4" />
          </svg>
        </button>

        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Limpiar naturaleza"
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink-2)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 8,
              color: 'var(--ink-3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'color 150ms ease',
            }}
          >
            <svg width={10} height={10} viewBox="0 0 10 10" fill="none"
              stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
              <path d="M1 1l8 8M9 1L1 9" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          border: '1px solid var(--rule)',
          background: 'var(--paper)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
        }}>
          <Command>
            <Command.Input
              placeholder="Filtrar..."
              style={{
                height: 40,
                padding: '0 14px',
                borderBottom: '1px solid var(--rule)',
                fontFamily: 'var(--sans)',
                fontSize: 14,
                background: 'transparent',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
                border: 'none',
                color: 'var(--ink-1)',
              }}
            />
            <Command.List style={{ padding: '4px 0' }}>
              <Command.Empty style={{
                padding: '12px 14px',
                fontFamily: 'var(--sans)',
                fontSize: 13,
                color: 'var(--ink-4)',
              }}>
                Sin resultados.
              </Command.Empty>

              {NATURE_OPTIONS.map(option => (
                <Command.Item
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  style={{
                    padding: '10px 14px',
                    fontFamily: 'var(--sans)',
                    fontSize: 14,
                    color: 'var(--ink-1)',
                    cursor: 'pointer',
                    listStyle: 'none',
                    transition: 'background 100ms ease',
                  }}
                >
                  {option.label}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </div>
      )}
    </div>
  )
}
