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
  enableInlineCreate?: boolean
  defaultVisibility?: 'privada_eric' | 'privada_ana' | 'compartida'
  onCreateCategory?: (payload: {
    name: string
    parent_id: string | null
    visibility: 'privada_eric' | 'privada_ana' | 'compartida'
  }) => Promise<{ ok: true; category: Category } | { error: string }>
  onCategoryCreated?: (cat: Category) => void
}

export function CategoryCombobox({
  categories, value, onChange,
  enableInlineCreate = false, defaultVisibility = 'compartida',
  onCreateCategory, onCategoryCreated,
}: Props) {
  const [open, setOpen] = useState(false)
  const [inlineCreate, setInlineCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newParent, setNewParent] = useState<string>('')
  const [newVisibility, setNewVisibility] = useState<'privada_eric' | 'privada_ana' | 'compartida'>(defaultVisibility)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        setInlineCreate(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setInlineCreate(false) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (inlineCreate) {
      setNewName('')
      setNewParent('')
      setNewVisibility(defaultVisibility)
      setCreateError(null)
      setTimeout(() => nameInputRef.current?.focus(), 50)
    }
  }, [inlineCreate, defaultVisibility])

  const roots = categories.filter(c => c.parent_id === null)

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
    if (c.color) return c.color
    let cur: Category | undefined = categories.find(x => x.id === c.parent_id)
    while (cur) {
      if (cur.color) return cur.color
      cur = categories.find(x => x.id === cur!.parent_id)
    }
    return 'var(--ink-4)'
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !onCreateCategory) return
    setCreating(true)
    setCreateError(null)
    const result = await onCreateCategory({
      name: newName.trim(),
      parent_id: newParent || null,
      visibility: newVisibility,
    })
    setCreating(false)
    if ('error' in result) {
      setCreateError(result.error)
      return
    }
    onCategoryCreated?.(result.category)
    onChange(result.category.id)
    setInlineCreate(false)
    setOpen(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 36,
    padding: '0 10px',
    border: '1px solid var(--rule)',
    background: 'transparent',
    fontFamily: 'var(--sans)',
    fontSize: 13,
    color: 'var(--ink-1)',
    outline: 'none',
    boxSizing: 'border-box',
    borderRadius: 0,
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--sans)',
    fontSize: 10,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    color: 'var(--ink-3)',
    marginBottom: 4,
    display: 'block',
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => { setOpen(o => !o); setInlineCreate(false) }}
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
                width: 8, height: 8, borderRadius: '50%',
                background: dotColor(selectedCat), flexShrink: 0, display: 'inline-block',
              }} />
            )}
            {selectedCat ? selectedCat.name : 'Sin categoría'}
          </span>
          <svg
            width={12} height={12} viewBox="0 0 12 12"
            fill="none" stroke="currentColor"
            strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
            style={{
              color: 'var(--ink-3)', flexShrink: 0,
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
              background: 'none', border: 'none', cursor: 'pointer', padding: 8,
              color: 'var(--ink-3)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0, transition: 'color 150ms ease',
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
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          border: '1px solid var(--rule)', background: 'var(--paper)',
          maxHeight: 360, overflow: 'hidden', display: 'flex',
          flexDirection: 'column', zIndex: 10,
        }}>
          {inlineCreate ? (
            /* ── Formulario alta inline ─────────────────── */
            <form onSubmit={handleCreate} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-3)', marginBottom: 4 }}>
                Nueva categoría
              </div>

              <div>
                <span style={labelStyle}>Nombre</span>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Nombre de la categoría"
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <span style={labelStyle}>Grupo padre</span>
                <select
                  value={newParent}
                  onChange={e => setNewParent(e.target.value)}
                  style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                >
                  <option value="">Sin grupo padre</option>
                  {roots.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <span style={labelStyle}>Visibilidad</span>
                <select
                  value={newVisibility}
                  onChange={e => setNewVisibility(e.target.value as typeof newVisibility)}
                  style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                >
                  <option value="compartida">Compartida</option>
                  <option value="privada_eric">Privada Eric</option>
                  <option value="privada_ana">Privada Ana</option>
                </select>
              </div>

              {createError && (
                <div style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--signal-neg)' }}>
                  {createError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setInlineCreate(false)}
                  style={{
                    fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 500,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    padding: '6px 12px', background: 'transparent',
                    border: '1px solid var(--rule)', borderRadius: 0,
                    color: 'var(--ink-3)', cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim() || creating}
                  style={{
                    fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 500,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    padding: '6px 12px', background: 'var(--ink-1)',
                    border: '1px solid var(--ink-1)', borderRadius: 0,
                    color: 'var(--paper)', cursor: !newName.trim() || creating ? 'not-allowed' : 'pointer',
                    opacity: !newName.trim() || creating ? 0.4 : 1,
                    fontStyle: creating ? 'italic' : 'normal',
                  }}
                >
                  {creating ? 'Creando…' : 'Crear'}
                </button>
              </div>
            </form>
          ) : (
            /* ── Buscador + lista ───────────────────────── */
            <Command>
              <Command.Input
                placeholder="Buscar categoría..."
                style={{
                  height: 40, padding: '0 14px',
                  borderBottom: '1px solid var(--rule)',
                  fontFamily: 'var(--sans)', fontSize: 14,
                  background: 'transparent', outline: 'none',
                  width: '100%', boxSizing: 'border-box',
                  border: 'none', color: 'var(--ink-1)',
                }}
              />
              <Command.List style={{ flex: 1, overflowY: 'auto', padding: '4px 0', maxHeight: 272 }}>
                <Command.Empty style={{ padding: '12px 14px', fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-4)' }}>
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
                          onSelect={() => { onChange(cat.id); setOpen(false) }}
                          style={{
                            padding: '10px 14px', paddingLeft: 14 * depth,
                            fontFamily: 'var(--sans)', fontSize: 14,
                            color: 'var(--ink-1)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 10,
                            listStyle: 'none', transition: 'background 100ms ease',
                          }}
                        >
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: dotColor(cat), flexShrink: 0, display: 'inline-block',
                          }} />
                          {cat.name}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )
                })}

                {/* Alta inline — solo si habilitado */}
                {enableInlineCreate && onCreateCategory && (
                  <Command.Item
                    value="__nueva_categoria__"
                    onSelect={() => setInlineCreate(true)}
                    style={{
                      padding: '10px 14px',
                      fontFamily: 'var(--sans)', fontSize: 13,
                      color: 'var(--ink-3)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      listStyle: 'none',
                      borderTop: '1px solid var(--rule-2)',
                      marginTop: 4,
                      transition: 'background 100ms ease',
                    }}
                  >
                    + Nueva categoría
                  </Command.Item>
                )}
              </Command.List>
            </Command>
          )}
        </div>
      )}
    </div>
  )
}
