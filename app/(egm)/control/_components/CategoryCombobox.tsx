'use client'
import { useState, useEffect, useRef } from 'react'
import { Command } from 'cmdk'

export type Category = {
  id: string
  name: string
  parent_id: string | null
  color: string | null
  is_active: boolean
}

interface Props {
  categories: Category[]
  value: string | null
  onChange: (id: string | null) => void
}

export function CategoryCombobox({ categories, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Root-level categories (group headings)
  const roots = categories.filter(c => c.parent_id === null)

  // DFS from rootId; depth 1 = direct child of root. All non-root nodes are selectable.
  function treeItems(rootId: string): Array<{ cat: Category; depth: number }> {
    function walk(parentId: string, depth: number): Array<{ cat: Category; depth: number }> {
      return categories
        .filter(c => c.parent_id === parentId)
        .flatMap(c => [{ cat: c, depth }, ...walk(c.id, depth + 1)])
    }
    return walk(rootId, 1)
  }

  const selectedCat = value ? categories.find(c => c.id === value) : null

  const dotColor = (c: Category): string => {
    // Use own color, then walk up to find the first ancestor with a color
    if (c.color) return c.color
    let cur: Category | undefined = categories.find(x => x.id === c.parent_id)
    while (cur) {
      if (cur.color) return cur.color
      cur = categories.find(x => x.id === cur!.parent_id)
    }
    return 'var(--ink-4)'
  }

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
            color: selectedCat ? 'var(--ink-1)' : 'var(--ink-3)',
            borderRadius: 0,
            transition: 'border-color 150ms ease',
            outline: 'none',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {selectedCat && (
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: dotColor(selectedCat),
                flexShrink: 0,
                display: 'inline-block',
              }} />
            )}
            {selectedCat ? selectedCat.name : 'Sin categoría'}
          </span>
          {/* Chevron SVG — rota 180° cuando abierto */}
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
            aria-label="Limpiar categoría"
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
          maxHeight: 320,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
        }}>
          <Command>
            <Command.Input
              placeholder="Buscar categoría..."
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
            <Command.List style={{
              flex: 1,
              overflowY: 'auto',
              padding: '4px 0',
              maxHeight: 272,
            }}>
              <Command.Empty style={{
                padding: '12px 14px',
                fontFamily: 'var(--sans)',
                fontSize: 13,
                color: 'var(--ink-4)',
              }}>
                Sin resultados.
              </Command.Empty>

              {roots.map(root => {
                const items = treeItems(root.id)
                if (items.length === 0) return null
                return (
                  <Command.Group
                    key={root.id}
                    heading={root.name}
                    style={{ listStyle: 'none', margin: 0, padding: 0 }}
                  >
                    {items.map(({ cat, depth }) => (
                      <Command.Item
                        key={cat.id}
                        value={`${root.name} ${cat.name}`}
                        onSelect={() => {
                          onChange(cat.id)
                          setOpen(false)
                        }}
                        style={{
                          padding: '10px 14px',
                          paddingLeft: 14 * depth,
                          fontFamily: 'var(--sans)',
                          fontSize: 14,
                          color: 'var(--ink-1)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          listStyle: 'none',
                          transition: 'background 100ms ease',
                        }}
                      >
                        <span style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: dotColor(cat),
                          flexShrink: 0,
                          display: 'inline-block',
                        }} />
                        {cat.name}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )
              })}
            </Command.List>
          </Command>
        </div>
      )}
    </div>
  )
}
