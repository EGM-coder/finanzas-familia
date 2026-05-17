'use client'

import { useState, useEffect, useRef } from 'react'
import { Drawer } from 'vaul'
import { CategoryCombobox, type Category } from './CategoryCombobox'
import { ProjectCombobox, type Project } from './ProjectCombobox'
import { toast } from 'sonner'
import { NatureSelect, type NatureValue } from './NatureSelect'
import { TitularRadio, type TitularValue } from './TitularRadio'
import { ReimbursableCheckbox } from './ReimbursableCheckbox'
import { updateTransaction, type UpdateTransactionPayload } from '../_actions/updateTransaction'

type TransactionRow = {
  id: string
  date: string
  amount: number
  currency: string
  counterparty: string | null
  raw_concept: string | null
  description: string | null
  category_id: string | null
  project_id: string | null
  nature: string | null
  titular: string | null
  is_reimbursable: boolean | null
}

interface Props {
  transaction: TransactionRow | null
  categories: Category[]
  projects: Project[]
  onClose: () => void
  onMarkRemoved: (id: string) => void
  onRestoreRow: () => void
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

export function CategorizationDrawer({
  transaction, categories, projects, onClose,
  onMarkRemoved, onRestoreRow,
}: Props) {
  const isOpen = transaction !== null
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.category_id ?? null)
  const [projectId, setProjectId] = useState<string | null>(transaction?.project_id ?? null)
  const [nature, setNature] = useState<NatureValue | null>((transaction?.nature as NatureValue | null) ?? null)
  const [titular, setTitular] = useState<TitularValue>((transaction?.titular as TitularValue) ?? 'compartido')
  const [isReimbursable, setIsReimbursable] = useState<boolean>(transaction?.is_reimbursable ?? false)
  const [isSaving, setIsSaving] = useState(false)
  const categoryWrapperRef = useRef<HTMLDivElement>(null)
  const handleSaveRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    setCategoryId(transaction?.category_id ?? null)
    setProjectId(transaction?.project_id ?? null)
    setNature((transaction?.nature as NatureValue | null) ?? null)
    setTitular((transaction?.titular as TitularValue) ?? 'compartido')
    setIsReimbursable(transaction?.is_reimbursable ?? false)
  }, [transaction?.id])

  // Forzar is_reimbursable a false cuando titular cambia fuera de 'eric'
  useEffect(() => {
    if (titular !== 'eric' && isReimbursable) setIsReimbursable(false)
  }, [titular])

  // Focus trigger del combobox al abrir
  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => {
      categoryWrapperRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    }, 120)
    return () => clearTimeout(timer)
  }, [isOpen])

  // Cmd/Ctrl+Enter
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSaveRef.current?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen])

  const fmtAmount = (n: number, cur: string) =>
    n.toLocaleString('es-ES', { style: 'currency', currency: cur || 'EUR' })

  const canSave = categoryId !== null && !isSaving

  async function handleSave() {
    if (!canSave || !transaction) return
    setIsSaving(true)

    const snapshot: UpdateTransactionPayload = {
      category_id:     transaction.category_id ?? null,
      project_id:      transaction.project_id ?? null,
      nature:          (transaction.nature as NatureValue | null) ?? null,
      titular:         (transaction.titular as TitularValue) ?? 'compartido',
      is_reimbursable: transaction.is_reimbursable ?? false,
    }

    const payload: UpdateTransactionPayload = {
      category_id:     categoryId,
      project_id:      projectId,
      nature,
      titular,
      is_reimbursable: isReimbursable,
    }

    const result = await updateTransaction(transaction.id, payload)
    setIsSaving(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    const txId = transaction.id
    onMarkRemoved(txId)
    onClose()
    toast.success('Categorizada', {
      duration: 5000,
      action: {
        label: 'Deshacer',
        onClick: async () => {
          const undo = await updateTransaction(txId, snapshot)
          if (undo.ok) {
            onRestoreRow()
            toast.success('Restaurada')
          } else {
            toast.error('No se pudo restaurar')
          }
        },
      },
    })
  }

  // Ref siempre apunta a la versión más reciente (evita closure stale en el listener)
  handleSaveRef.current = handleSave

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
                  {(() => {
                    const text = transaction.counterparty || transaction.description || '—'
                    return text.length > 80 ? text.slice(0, 80) + '…' : text
                  })()}
                </div>

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

            {/* Proyecto */}
            <div>
              <FieldLabel>Proyecto</FieldLabel>
              <ProjectCombobox
                projects={projects}
                value={projectId}
                onChange={setProjectId}
              />
            </div>

            {/* Naturaleza */}
            <div>
              <FieldLabel>Naturaleza</FieldLabel>
              <NatureSelect value={nature} onChange={setNature} />
            </div>

            {/* Titular */}
            <div>
              <FieldLabel>Titular</FieldLabel>
              <TitularRadio value={titular} onChange={setTitular} />
            </div>

            {/* Reembolsable Nordex */}
            <ReimbursableCheckbox
              checked={isReimbursable}
              onChange={setIsReimbursable}
              disabled={titular !== 'eric'}
            />

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
              disabled={!canSave}
              onClick={handleSave}
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
                color: canSave ? 'var(--paper)' : 'var(--ink-3)',
                fontStyle: isSaving ? 'italic' : 'normal',
                cursor: canSave ? 'pointer' : 'not-allowed',
                opacity: canSave ? 1 : 0.3,
                transition: 'opacity 150ms ease',
              }}
            >
              {isSaving ? 'Guardando…' : 'Guardar'}
            </button>
          </footer>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
