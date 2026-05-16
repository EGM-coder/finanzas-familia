'use client'

import { useState, useEffect, useRef } from 'react'
import { Drawer } from 'vaul'
import { CategoryCombobox, type Category } from './CategoryCombobox'

type TransactionRow = {
  id: string
  date: string
  amount: number
  currency: string
  counterparty: string | null
  raw_concept: string | null
  description: string | null
  category_id: string | null
}

interface Props {
  transaction: TransactionRow | null
  categories: Category[]
  onClose: () => void
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--sans)',
      fontSize: 11,
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      color: 'var(--ink-3)',
      marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

function GhostField({ label }: { label: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div style={{
        border: '1px solid var(--rule)',
        padding: '0 14px',
        height: 40,
        boxSizing: 'border-box',
        background: 'transparent',
        fontFamily: 'var(--sans)',
        fontSize: 12,
        fontStyle: 'italic',
        color: 'var(--ink-4)',
        cursor: 'not-allowed',
        opacity: 0.6,
        display: 'flex',
        alignItems: 'center',
      }}>
        Próximamente
      </div>
    </div>
  )
}

export function CategorizationDrawer({ transaction, categories, onClose }: Props) {
  const isOpen = transaction !== null
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.category_id ?? null)
  const categoryWrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCategoryId(transaction?.category_id ?? null)
  }, [transaction?.id])

  // Focus trigger del combobox al abrir
  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => {
      categoryWrapperRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    }, 120)
    return () => clearTimeout(timer)
  }, [isOpen])

  // Cmd/Ctrl+Enter — reservado para Paso 7
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        // TODO: Paso 7 — submit
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen])

  const fmtAmount = (n: number, cur: string) =>
    n.toLocaleString('es-ES', { style: 'currency', currency: cur || 'EUR' })

  return (
    <Drawer.Root
      direction="right"
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose() }}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            zIndex: 50,
          }}
        />
        <Drawer.Content
          aria-describedby={undefined}
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 480,
            maxWidth: '100vw',
            background: 'var(--paper)',
            borderLeft: '1px solid var(--rule)',
            borderRadius: 0,
            boxShadow: 'none',
            zIndex: 51,
            outline: 'none',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'none' }}><Drawer.Handle /></div>

          {/* Zona scrollable */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '32px 24px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}>
            {/* Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Drawer.Title style={{
                fontFamily: 'var(--serif)',
                fontSize: 22,
                fontWeight: 400,
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
                color: 'var(--ink-1)',
                margin: 0,
              }}>
                Categorizar
              </Drawer.Title>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--rule)'
                  e.currentTarget.style.color = 'var(--ink-1)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--ink-3)'
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 8,
                  color: 'var(--ink-3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 150ms ease, color 150ms ease',
                  borderRadius: 0,
                }}
              >
                <svg width={14} height={14} viewBox="0 0 14 14" fill="none"
                  stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                  <path d="M1 1l12 12M13 1L1 13" />
                </svg>
              </button>
            </header>

            {/* Contexto transacción (read-only) */}
            {transaction && (
              <section style={{
                borderTop: '1px solid var(--rule)',
                borderBottom: '1px solid var(--rule)',
                padding: '16px 0',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: 'var(--ink-3)',
                  }}>
                    {transaction.date}
                  </span>
                  <span style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 20,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.01em',
                    color: transaction.amount >= 0
                      ? 'var(--positive, var(--ink-1))'
                      : 'var(--ink-1)',
                  }}>
                    {fmtAmount(transaction.amount, transaction.currency)}
                  </span>
                </div>

                <div style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: 'var(--ink-2)',
                }}>
                  {transaction.counterparty || transaction.description || '—'}
                </div>

                {transaction.raw_concept && (
                  <div
                    title={transaction.raw_concept}
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 11,
                      color: 'var(--ink-4)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {transaction.raw_concept}
                  </div>
                )}
              </section>
            )}

            {/* Categoría */}
            <div>
              <FieldLabel>Categoría</FieldLabel>
              <div ref={categoryWrapperRef}>
                <CategoryCombobox
                  categories={categories}
                  value={categoryId}
                  onChange={setCategoryId}
                />
              </div>
            </div>

            <GhostField label="Proyecto" />
            <GhostField label="Naturaleza" />
            <GhostField label="Titular" />
            <GhostField label="Reembolsable Nordex" />
            <GhostField label="Guardar como regla" />
          </div>

          {/* Footer sticky */}
          <footer style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            padding: '16px 24px',
            paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
            borderTop: '1px solid var(--rule)',
            background: 'var(--paper)',
            flexShrink: 0,
          }}>
            <button
              onClick={onClose}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--ink-2)'
                e.currentTarget.style.color = 'var(--ink-1)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--rule)'
                e.currentTarget.style.color = 'var(--ink-2)'
              }}
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--rule)',
                borderRadius: 0,
                color: 'var(--ink-2)',
                cursor: 'pointer',
                transition: 'border-color 150ms ease, color 150ms ease',
              }}
            >
              Cancelar
            </button>
            <button
              disabled
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '8px 16px',
                background: 'var(--ink-1)',
                border: '1px solid var(--ink-1)',
                borderRadius: 0,
                color: 'var(--paper)',
                cursor: 'not-allowed',
                opacity: 0.3,
              }}
            >
              Guardar
            </button>
          </footer>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
