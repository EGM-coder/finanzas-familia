'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Drawer } from 'vaul'
import { CategoryCombobox, type Category } from './CategoryCombobox'
import { ProjectCombobox, type Project } from './ProjectCombobox'
import { toast } from 'sonner'
import { NatureSelect, type NatureValue } from './NatureSelect'
import { TitularRadio, type TitularValue } from './TitularRadio'
import { ReimbursableCheckbox } from './ReimbursableCheckbox'
import { RuleSubForm } from './RuleSubForm'
import { updateTransaction, type UpdateTransactionPayload } from '../_actions/updateTransaction'
import { createRule, type MatchField } from '../_actions/createRule'
import { deleteRule } from '../_actions/deleteRule'
import { toggleDirectCharge } from '../_actions/toggleDirectCharge'

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
  order_id: string | null
  is_direct_charge: boolean
}

export type DirtySnapshot = {
  categoryId: string | null
  projectId: string | null
  nature: NatureValue | null
  titular: TitularValue
  isReimbursable: boolean
}

interface Props {
  transaction: TransactionRow | null
  categories: Category[]
  projects: Project[]
  onClose: () => void
  onMarkRemoved: (id: string) => void
  onRestoreRow: () => void
  initialDirtySnapshot: DirtySnapshot | null
  onConsumeDirtySnapshot: () => void
  onReopenWithDirty: (txnId: string, snapshot: DirtySnapshot) => void
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

export function CategorizationDrawer({
  transaction, categories, projects, onClose,
  onMarkRemoved, onRestoreRow,
  initialDirtySnapshot, onConsumeDirtySnapshot, onReopenWithDirty,
}: Props) {
  const router = useRouter()
  const isOpen = transaction !== null
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.category_id ?? null)
  const [projectId, setProjectId] = useState<string | null>(transaction?.project_id ?? null)
  const [nature, setNature] = useState<NatureValue | null>((transaction?.nature as NatureValue | null) ?? null)
  const [titular, setTitular] = useState<TitularValue>((transaction?.titular as TitularValue) ?? 'compartido')
  const [isReimbursable, setIsReimbursable] = useState<boolean>(transaction?.is_reimbursable ?? false)
  const [isDirectCharge, setIsDirectCharge] = useState<boolean>(transaction?.is_direct_charge ?? false)
  const [isSaving, setIsSaving] = useState(false)
  const [isRuleSubFormOpen, setIsRuleSubFormOpen] = useState(false)
  const categoryWrapperRef = useRef<HTMLDivElement>(null)
  const handleSaveRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    if (!transaction) return
    if (initialDirtySnapshot) {
      setCategoryId(initialDirtySnapshot.categoryId)
      setProjectId(initialDirtySnapshot.projectId)
      setNature(initialDirtySnapshot.nature)
      setTitular(initialDirtySnapshot.titular)
      setIsReimbursable(initialDirtySnapshot.isReimbursable)
      onConsumeDirtySnapshot()
    } else {
      setCategoryId(transaction.category_id ?? null)
      setProjectId(transaction.project_id ?? null)
      setNature((transaction.nature as NatureValue | null) ?? null)
      setTitular((transaction.titular as TitularValue) ?? 'compartido')
      setIsReimbursable(transaction.is_reimbursable ?? false)
    }
    setIsDirectCharge(transaction.is_direct_charge ?? false)
    setIsRuleSubFormOpen(false)
  }, [transaction?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (titular !== 'eric' && isReimbursable) setIsReimbursable(false)
  }, [titular]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => {
      categoryWrapperRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    }, 120)
    return () => clearTimeout(timer)
  }, [isOpen])

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

  const isDirty = useMemo(() => {
    if (!transaction) return false
    return (
      categoryId     !== (transaction.category_id ?? null) ||
      projectId      !== (transaction.project_id ?? null) ||
      nature         !== ((transaction.nature as NatureValue | null) ?? null) ||
      titular        !== ((transaction.titular as TitularValue) ?? 'compartido') ||
      isReimbursable !== (transaction.is_reimbursable ?? false)
    )
  }, [transaction, categoryId, projectId, nature, titular, isReimbursable])

  const canSave = categoryId !== null && !isSaving

  // Cierre con dirty-check — Vaul onOpenChange + botón Cancelar
  const handleClose = useCallback(() => {
    if (!isDirty || !transaction) {
      onClose()
      return
    }
    const dirtySnapshot: DirtySnapshot = { categoryId, projectId, nature, titular, isReimbursable }
    const txnId = transaction.id
    onClose()
    const tid = toast('Cambios descartados', {
      duration: 3000,
      action: (
        <button
          type="button"
          className="egm-toast-undo"
          onClick={() => {
            toast.dismiss(tid)
            onReopenWithDirty(txnId, dirtySnapshot)
          }}
        >
          Deshacer
        </button>
      ),
    })
  }, [isDirty, transaction, categoryId, projectId, nature, titular, isReimbursable, onClose, onReopenWithDirty])

  // Cierre forzado — success path de Guardar/Crear regla, omite dirty check
  const forceClose = useCallback(() => { onClose() }, [onClose])

  function buildSnapshot(): UpdateTransactionPayload {
    if (!transaction) throw new Error('no transaction')
    return {
      category_id:     transaction.category_id ?? null,
      project_id:      transaction.project_id ?? null,
      nature:          (transaction.nature as NatureValue | null) ?? null,
      titular:         (transaction.titular as TitularValue) ?? 'compartido',
      is_reimbursable: transaction.is_reimbursable ?? false,
    }
  }

  function buildPayload(): UpdateTransactionPayload {
    return { category_id: categoryId, project_id: projectId, nature, titular, is_reimbursable: isReimbursable }
  }

  async function handleSave() {
    if (!canSave || !transaction) return
    setIsSaving(true)

    const snapshot = buildSnapshot()
    const payload  = buildPayload()
    const result   = await updateTransaction(transaction.id, payload)
    setIsSaving(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    const txId = transaction.id
    onMarkRemoved(txId)
    forceClose()
    const tid = toast.success('Categorizada', {
      duration: 5000,
      action: (
        <button
          type="button"
          className="egm-toast-undo"
          onClick={async () => {
            toast.dismiss(tid)
            const undo = await updateTransaction(txId, snapshot)
            if (undo.ok) {
              onRestoreRow()
              toast.success('Restaurada')
            } else {
              toast.error('No se pudo restaurar')
            }
          }}
        >
          Deshacer
        </button>
      ),
    })
  }

  async function handleToggleDirect() {
    if (!transaction || transaction.order_id !== null) return
    const newVal = !isDirectCharge
    setIsDirectCharge(newVal)  // optimistic
    const result = await toggleDirectCharge(transaction.id, newVal)
    if (!result.ok) {
      setIsDirectCharge(!newVal)  // revert
      toast.error(result.error)
    } else {
      router.refresh()
    }
  }

  async function handleCreateRuleAndSave(matchField: MatchField, matchValue: string) {
    if (!canSave || !transaction) return
    setIsSaving(true)

    const snapshot = buildSnapshot()
    const payload  = buildPayload()

    const ruleResult = await createRule({
      match_field:     matchField,
      match_value:     matchValue,
      set_category_id: categoryId,
      set_project_id:  projectId,
      set_nature:      nature,
    })

    if (!ruleResult.ok) {
      setIsSaving(false)
      toast.error(ruleResult.error)
      return
    }

    const updateResult = await updateTransaction(transaction.id, payload)
    setIsSaving(false)

    if (!updateResult.ok) {
      await deleteRule(ruleResult.ruleId)
      toast.error(updateResult.error)
      return
    }

    const txId   = transaction.id
    const ruleId = ruleResult.ruleId
    onMarkRemoved(txId)
    forceClose()

    const tid = toast.success('Categorizada y regla creada', {
      duration: 5000,
      action: (
        <button
          type="button"
          className="egm-toast-undo"
          onClick={async () => {
            toast.dismiss(tid)
            const [undoTx, undoRule] = await Promise.all([
              updateTransaction(txId, snapshot),
              deleteRule(ruleId),
            ])
            if (undoTx.ok && undoRule.ok) {
              onRestoreRow()
              toast.success('Restaurada')
            } else {
              toast.error('No se pudo restaurar todo')
            }
          }}
        >
          Deshacer
        </button>
      ),
    })
  }

  handleSaveRef.current = handleSave

  return (
    <Drawer.Root
      direction="right"
      open={isOpen}
      onOpenChange={(open) => { if (!open) handleClose() }}
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
            minHeight: 0,
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
                onClick={handleClose}
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

            {/* Guardar como regla — sub-form (render condicional) */}
            {isRuleSubFormOpen && transaction && (
              <RuleSubForm
                transaction={transaction}
                categoryId={categoryId}
                projectId={projectId}
                nature={nature}
                onCreate={handleCreateRuleAndSave}
                isSaving={isSaving}
              />
            )}

            {/* T-033: cargo directo — solo para raíl (PayPal/Amazon) sin enlace */}
            {transaction && transaction.order_id === null && (() => {
              const cp = transaction.counterparty?.toLowerCase() ?? ''
              const isRail = cp.includes('paypal') || cp.includes('amazon') || transaction.is_direct_charge
              if (!isRail) return null
              return (
                <div style={{ paddingTop: 16, borderTop: '1px solid var(--rule-2)' }}>
                  <button
                    type="button"
                    onClick={handleToggleDirect}
                    style={{
                      background: 'none',
                      border: '1px solid var(--rule)',
                      padding: '7px 14px',
                      cursor: 'pointer',
                      fontFamily: 'var(--sans)',
                      fontSize: 11,
                      letterSpacing: '0.06em',
                      color: isDirectCharge ? 'var(--signal-neg)' : 'var(--ink-3)',
                      borderRadius: 0,
                      transition: 'color 150ms ease, border-color 150ms ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink-3)'; e.currentTarget.style.color = 'var(--ink-1)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--rule)'; e.currentTarget.style.color = isDirectCharge ? 'var(--signal-neg)' : 'var(--ink-3)' }}
                  >
                    {isDirectCharge ? 'Quitar cargo directo' : 'Marcar como cargo directo'}
                  </button>
                  {isDirectCharge && (
                    <div className="roman" style={{ fontSize: 10, marginTop: 6, color: 'var(--ink-4)' }}>
                      Cargo de raíl sin pedido asociado — no requiere conciliación.
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Footer sticky */}
          <footer style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 12,
            padding: '16px 24px',
            paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
            borderTop: '1px solid var(--rule)',
            background: 'var(--paper)',
            flexShrink: 0,
          }}>
            <button
              onClick={handleClose}
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
              onClick={() => setIsRuleSubFormOpen(v => !v)}
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
                color: canSave ? 'var(--ink-2)' : 'var(--ink-4)',
                cursor: canSave ? 'pointer' : 'not-allowed',
                opacity: canSave ? 1 : 0.4,
                transition: 'color 150ms ease, border-color 150ms ease',
                textDecoration: isRuleSubFormOpen ? 'underline' : 'none',
                textUnderlineOffset: 3,
              }}
            >
              {isRuleSubFormOpen ? 'Cancelar regla' : 'Guardar como regla'}
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
