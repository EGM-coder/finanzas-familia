'use client'

import { useState, useEffect, useRef } from 'react'
import { Command } from 'cmdk'
import { toast } from 'sonner'
import { createProject } from '../_actions/createProject'

export type Project = { id: string; name: string; slug: string }

interface Props {
  projects: Project[]
  value: string | null
  onChange: (id: string | null) => void
}

export function ProjectCombobox({ projects, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [allProjects, setAllProjects] = useState<Project[]>(projects)
  const [isCreating, setIsCreating] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Sync cuando el servidor revalida y llegan nuevos proyectos via props
  useEffect(() => {
    setAllProjects(prev => {
      const incoming = new Set(projects.map(p => p.id))
      const extras = prev.filter(p => !incoming.has(p.id))
      return [...projects, ...extras]
    })
  }, [projects])

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

  // Esc cierra dropdown (sin propagar, para no cerrar el drawer)
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

  const selected = value ? allProjects.find(p => p.id === value) : null
  const trimmedQuery = query.trim()
  const hasExactMatch = allProjects.some(
    p => p.name.trim().toLowerCase() === trimmedQuery.toLowerCase()
  )
  const showCreate = trimmedQuery !== '' && !hasExactMatch

  // Filtrado manual para saber si hay matches visibles (necesario para hairline)
  const matches = trimmedQuery === ''
    ? allProjects
    : allProjects.filter(p => p.name.toLowerCase().includes(trimmedQuery.toLowerCase()))

  async function handleCreate() {
    if (isCreating) return
    setIsCreating(true)
    try {
      const result = await createProject(trimmedQuery)
      if (result.ok) {
        setAllProjects(prev => {
          if (prev.some(p => p.id === result.project.id)) return prev
          return [...prev, result.project]
        })
        onChange(result.project.id)
        setQuery('')
        setOpen(false)
      } else {
        toast.error(result.error)
      }
    } finally {
      setIsCreating(false)
    }
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
            color: selected ? 'var(--ink-1)' : 'var(--ink-3)',
            fontStyle: selected ? 'normal' : 'italic',
            borderRadius: 0,
            transition: 'border-color 150ms ease',
            outline: 'none',
          }}
        >
          <span>{selected ? selected.name : 'Rutina familiar'}</span>
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
            aria-label="Limpiar proyecto"
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
          <Command shouldFilter={false}>
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar o crear proyecto..."
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
              {/* Empty state: sin proyectos y query vacío */}
              {allProjects.length === 0 && trimmedQuery === '' && (
                <div style={{
                  padding: '12px 14px',
                  fontFamily: 'var(--sans)',
                  fontSize: 13,
                  fontStyle: 'italic',
                  color: 'var(--ink-3)',
                }}>
                  Sin proyectos · escribe para crear uno
                </div>
              )}

              {/* Lista plana filtrada */}
              {matches.map(project => (
                <Command.Item
                  key={project.id}
                  value={project.id}
                  onSelect={() => {
                    onChange(project.id)
                    setQuery('')
                    setOpen(false)
                  }}
                  style={{
                    padding: '10px 14px',
                    fontFamily: 'var(--sans)',
                    fontSize: 14,
                    color: 'var(--ink-1)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    listStyle: 'none',
                    transition: 'background 100ms ease',
                  }}
                >
                  {project.name}
                </Command.Item>
              ))}

              {/* Item creatable */}
              {showCreate && (
                <Command.Item
                  value={`__create__${trimmedQuery}`}
                  disabled={isCreating}
                  onSelect={handleCreate}
                  style={{
                    padding: '10px 14px',
                    fontFamily: 'var(--sans)',
                    fontSize: 14,
                    color: 'var(--ink-2)',
                    cursor: isCreating ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    listStyle: 'none',
                    transition: 'background 100ms ease',
                    ...(matches.length > 0 ? {
                      borderTop: '1px solid var(--rule-2)',
                      marginTop: 4,
                      paddingTop: 14,
                    } : {}),
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 13,
                    color: 'var(--ink-3)',
                    lineHeight: 1,
                  }}>+</span>
                  <span style={{ fontStyle: 'italic', color: 'var(--ink-3)' }}>
                    Crear
                  </span>
                  <span style={{ fontStyle: 'italic', color: 'var(--ink-2)' }}>
                    &ldquo;{trimmedQuery}&rdquo;
                  </span>
                </Command.Item>
              )}
            </Command.List>
          </Command>
        </div>
      )}
    </div>
  )
}
