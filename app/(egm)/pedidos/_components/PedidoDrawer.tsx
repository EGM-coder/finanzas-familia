'use client'

import { useState, useEffect, useTransition } from 'react'
import { Drawer } from 'vaul'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { CategoryCombobox, type Category } from '@/app/(egm)/control/_components/CategoryCombobox'
import {
  confirmMatch, linkManual, updateOrderCategory, searchCandidates,
  type CandidateTxn,
} from '../_actions/pedidos'
import type { Pedido, PedidoCharge } from './types'

// ── Helpers ──────────────────────────────────────────────────

function fmtDate(s: string): string {
  const months = ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii']
  const [y, m, d] = s.split('-').map(Number)
  return `${d}·${months[m - 1]}·${String(y).slice(-2)}`
}

function fmtAmount(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function sourceLabel(source: string): string {
  return ({
    amazon_email: 'Amazon e-mail', amazon_csv: 'Amazon CSV',
    paypal_email: 'PayPal e-mail', paypal_csv: 'PayPal CSV', manual: 'Manual',
  } as Record<string, string>)[source] ?? source
}

function confirmedCharge(order: Pedido): PedidoCharge | undefined {
  return order.purchase_order_charges.find(c => c.match_method === 'confirmed' || c.match_method === 'manual')
}

function aiProposedCharge(order: Pedido): PedidoCharge | undefined {
  return order.purchase_order_charges.find(c => c.match_method === 'ai_proposed')
}

// ── Sub-components ───────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--sans)', fontSize: 10, fontWeight: 500,
      textTransform: 'uppercase', letterSpacing: '0.16em',
      color: 'var(--ink-3)', marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Cerrar"
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--rule)'; e.currentTarget.style.color = 'var(--ink-1)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-3)' }}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: 8, color: 'var(--ink-3)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        borderRadius: 0, transition: 'background 150ms ease, color 150ms ease',
        flexShrink: 0,
      }}
    >
      <svg width={14} height={14} viewBox="0 0 14 14" fill="none"
        stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
        <path d="M1 1l12 12M13 1L1 13" />
      </svg>
    </button>
  )
}

function ChargeLine({ charge }: { charge: PedidoCharge }) {
  const txn = charge.transactions
  if (!txn) return null
  return (
    <div style={{
      padding: '12px 14px', background: 'var(--bg-soft)',
      border: '1px solid var(--rule-2)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-1)' }}>
          {txn.counterparty ?? '—'}
        </span>
        <span className="num" style={{ fontSize: 13, color: 'var(--signal-neg)', flexShrink: 0 }}>
          {fmtAmount(Math.abs(txn.amount))}&thinsp;€
        </span>
      </div>
      <div className="roman" style={{ fontSize: 11, marginTop: 4, color: 'var(--ink-3)' }}>
        {fmtDate(txn.date)}
        {charge.match_method === 'ai_proposed' && (
          <span style={{ marginLeft: 8, color: 'var(--signal-warn)' }}>· propuesto por IA</span>
        )}
        {(charge.match_method === 'confirmed' || charge.match_method === 'manual') && (
          <span style={{ marginLeft: 8 }}>· {charge.match_method === 'manual' ? 'enlace manual' : 'confirmado'}</span>
        )}
      </div>
    </div>
  )
}

// ── Main drawer ───────────────────────────────────────────────

interface Props {
  order: Pedido | null
  categories: Category[]
  onClose: () => void
}

export function PedidoDrawer({ order, categories, onClose }: Props) {
  const router = useRouter()
  const isOpen = order !== null

  // D-005: la fuente de verdad de categoría
  const confirmed = order ? confirmedCharge(order) : undefined
  const aiProposed = order ? aiProposedCharge(order) : undefined
  const linkedTxnId  = confirmed?.transaction_id ?? null
  const initialCatId = confirmed?.transactions?.category_id
    ?? order?.purchase_order_lines[0]?.category_id
    ?? null
  const aiSuggestedCatId = order?.purchase_order_lines[0]?.ai_suggested_category_id ?? null

  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [persistedCatId, setPersistedCatId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [linkPanelOpen, setLinkPanelOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [candidates, setCandidates] = useState<CandidateTxn[]>([])
  const [isPending, startTransition] = useTransition()

  // Reset state when order changes
  useEffect(() => {
    if (!order) return
    const init = initialCatId
    setCategoryId(init)
    setPersistedCatId(init)
    setLinkPanelOpen(false)
    setSearchQ('')
    setCandidates([])
  }, [order?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-buscar candidatos cuando se abre el panel de enlace manual
  useEffect(() => {
    if (!linkPanelOpen || !order) return
    startTransition(async () => {
      const results = await searchCandidates(order.order_date, '')
      setCandidates(results)
    })
  }, [linkPanelOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const isDirtyCategory = categoryId !== persistedCatId

  // ── Handlers ─────────────────────────────────────────────

  async function handleCategorySave() {
    if (!order || !isDirtyCategory) return
    setIsSaving(true)
    const result = await updateOrderCategory(order.id, categoryId, linkedTxnId)
    setIsSaving(false)
    if (result.ok) {
      setPersistedCatId(categoryId)
      toast.success('Categoría guardada')
    } else {
      toast.error(result.error)
    }
  }

  async function handleConfirm() {
    if (!order || !aiProposed) return
    setIsSaving(true)
    const result = await confirmMatch(
      aiProposed.id, order.id, order.is_financed,
      aiProposed.transaction_id, categoryId,
    )
    setIsSaving(false)
    if (result.ok) {
      toast.success('Enlace confirmado')
      onClose()
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleLink(txnId: string) {
    if (!order) return
    setIsSaving(true)
    const lineCat = order.purchase_order_lines[0]?.category_id ?? null
    const result = await linkManual(order.id, txnId, order.is_financed, lineCat)
    setIsSaving(false)
    if (result.ok) {
      toast.success('Cargo enlazado')
      onClose()
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  function handleSearch(q: string) {
    if (!order) return
    setSearchQ(q)
    startTransition(async () => {
      const results = await searchCandidates(order.order_date, q)
      setCandidates(results)
    })
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <Drawer.Root
      direction="right"
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose() }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.3)', zIndex: 50,
        }} />
        <Drawer.Content
          aria-describedby={undefined}
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 480, maxWidth: '100vw',
            background: 'var(--paper)', borderLeft: '1px solid var(--rule)',
            borderRadius: 0, boxShadow: 'none', zIndex: 51,
            outline: 'none', display: 'flex', flexDirection: 'column',
          }}
        >
          {/* P-015: wrapper .egm para que las clases del kit funcionen en el portal */}
          <div className="egm" style={{ display: 'contents' }}>
            <div style={{ display: 'none' }}><Drawer.Handle /></div>

            {/* Zona scrollable */}
            <div style={{
              flex: 1, minHeight: 0, overflowY: 'auto',
              padding: '32px 24px 24px',
              display: 'flex', flexDirection: 'column', gap: 24,
            }}>

              {/* Header */}
              <header style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'flex-start', gap: 12,
              }}>
                <div>
                  <Drawer.Title style={{
                    fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 400,
                    letterSpacing: '-0.01em', lineHeight: 1.2,
                    color: 'var(--ink-1)', margin: 0,
                  }}>
                    {order?.merchant ?? '—'}
                  </Drawer.Title>
                  {order && (
                    <div className="roman" style={{ fontSize: 12, marginTop: 4, color: 'var(--ink-3)' }}>
                      {fmtDate(order.order_date)} · {sourceLabel(order.source)}
                    </div>
                  )}
                </div>
                <CloseBtn onClick={onClose} />
              </header>

              {/* Resumen del pedido */}
              {order && (
                <section style={{
                  borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)',
                  padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span className="label">Total</span>
                    <span className="num" style={{ fontSize: 18 }}>
                      {fmtAmount(order.total_amount)}&thinsp;{order.currency}
                    </span>
                  </div>
                  {order.is_financed && order.installment_count && (
                    <div className="roman" style={{ fontSize: 12 }}>
                      {order.installment_count} cuotas de{' '}
                      <span className="num">{fmtAmount(order.installment_amount ?? 0)}</span>&thinsp;€
                      {order.first_charge_date && <> · desde {fmtDate(order.first_charge_date)}</>}
                    </div>
                  )}
                  {/* Tres ejes de estado — D-005 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {/* Enlace */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span className="label" style={{ fontSize: 9, color: 'var(--ink-4)', minWidth: 72 }}>Enlace</span>
                      <span className="roman" style={{ fontSize: 12 }}>
                        {order.match_status === 'completo'
                          ? '● Enlazado'
                          : order.match_status === 'parcial'
                            ? '◐ Enlace parcial'
                            : aiProposed
                              ? '○ Propuesto — por confirmar'
                              : '○ Sin enlazar'}
                      </span>
                    </div>
                    {/* Pago (solo si financiado) */}
                    {order.is_financed && order.installment_count && (() => {
                      const n = order.purchase_order_charges.filter(
                        c => c.match_method === 'confirmed' || c.match_method === 'manual',
                      ).length
                      const m = order.installment_count
                      return (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                          <span className="label" style={{ fontSize: 9, color: 'var(--ink-4)', minWidth: 72 }}>Pago</span>
                          <span className="roman" style={{ fontSize: 12 }}>
                            {n >= m ? '● Pagado' : `pagando ${n}/${m} cuotas`}
                          </span>
                        </div>
                      )
                    })()}
                    {/* Clasificación */}
                    {(() => {
                      const ok = confirmed
                        ? confirmed.transactions?.category_id !== null
                        : order.purchase_order_lines.some(l => l.category_id !== null)
                      return (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                          <span className="label" style={{ fontSize: 9, color: 'var(--ink-4)', minWidth: 72 }}>Clasificación</span>
                          <span className="roman" style={{ fontSize: 12 }}>
                            {ok ? '● Categorizado' : '◐ Sin categoría'}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                  {order.source_order_id && (
                    <div className="roman" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                      {order.source_order_id}
                    </div>
                  )}
                </section>
              )}

              {/* Líneas del pedido */}
              {order && order.purchase_order_lines.length > 0 && (
                <section>
                  <FieldLabel>Líneas</FieldLabel>
                  {order.purchase_order_lines.map(line => (
                    <div key={line.id} style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'baseline', gap: 12,
                      padding: '9px 0', borderBottom: '1px solid var(--rule-2)',
                    }}>
                      <span style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-1)' }}>
                        {line.description}
                        {line.quantity > 1 && (
                          <span className="roman" style={{ fontSize: 12 }}>&thinsp;×{line.quantity}</span>
                        )}
                      </span>
                      <span className="num" style={{ fontSize: 13, flexShrink: 0 }}>
                        {fmtAmount(line.total_amount)}&thinsp;€
                      </span>
                    </div>
                  ))}
                </section>
              )}

              {/* Cargo enlazado o propuesto */}
              {order && (confirmed || aiProposed) && (
                <section>
                  <FieldLabel>
                    {confirmed ? 'Cargo enlazado' : 'Cargo propuesto por IA'}
                  </FieldLabel>
                  {confirmed && <ChargeLine charge={confirmed} />}
                  {!confirmed && aiProposed && <ChargeLine charge={aiProposed} />}
                </section>
              )}

              {/* D-005: Control de categoría */}
              {order && (
                <section>
                  <FieldLabel>Categoría</FieldLabel>
                  {aiSuggestedCatId && !persistedCatId && (
                    <div className="roman" style={{ fontSize: 11, marginBottom: 6, color: 'var(--ink-3)' }}>
                      Sugerida por IA — confirma o elige otra.
                    </div>
                  )}
                  <CategoryCombobox
                    categories={categories}
                    value={categoryId ?? aiSuggestedCatId}
                    onChange={setCategoryId}
                  />
                  <div className="roman" style={{ fontSize: 11, marginTop: 6, color: 'var(--ink-4)' }}>
                    {linkedTxnId
                      ? 'Escribe directamente sobre el cargo de Control.'
                      : 'Guardado en la línea del pedido hasta enlazar.'}
                  </div>
                </section>
              )}

              {/* Panel de enlace manual */}
              {order && linkPanelOpen && (
                <section>
                  <FieldLabel>Buscar cargo de Control</FieldLabel>
                  <input
                    type="text"
                    placeholder="Filtrar por contrapartida..."
                    value={searchQ}
                    onChange={e => handleSearch(e.target.value)}
                    style={{
                      height: 40, width: '100%', boxSizing: 'border-box',
                      padding: '0 14px', border: '1px solid var(--rule)',
                      background: 'transparent', outline: 'none',
                      fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--ink-1)',
                    }}
                  />
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {isPending && (
                      <div className="roman" style={{ fontSize: 12, color: 'var(--ink-4)', padding: '8px 0' }}>
                        Buscando...
                      </div>
                    )}
                    {!isPending && candidates.length === 0 && (
                      <div className="roman" style={{ fontSize: 12, color: 'var(--ink-4)', padding: '8px 0' }}>
                        Sin candidatos en ±15 días del pedido.
                      </div>
                    )}
                    {candidates.map(txn => (
                      <button
                        key={txn.id}
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleLink(txn.id)}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-soft)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        style={{
                          width: '100%', padding: '10px 12px',
                          border: '1px solid var(--rule)',
                          background: 'transparent', cursor: 'pointer',
                          textAlign: 'left', display: 'flex',
                          justifyContent: 'space-between', alignItems: 'center',
                          gap: 12, transition: 'background 100ms ease',
                          borderRadius: 0,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontFamily: 'var(--sans)', fontSize: 13,
                            color: 'var(--ink-1)', overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {txn.counterparty ?? txn.description ?? '—'}
                          </div>
                          <div className="roman" style={{ fontSize: 11, marginTop: 2, color: 'var(--ink-3)' }}>
                            {fmtDate(txn.date)}
                          </div>
                        </div>
                        <span className="num" style={{
                          fontSize: 13, color: 'var(--signal-neg)', flexShrink: 0,
                        }}>
                          {fmtAmount(Math.abs(txn.amount))}&thinsp;€
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Footer de acciones — sticky */}
            {order && (
              <div style={{
                borderTop: '1px solid var(--rule)',
                padding: '16px 24px',
                display: 'flex', flexDirection: 'column', gap: 8,
                background: 'var(--paper)',
              }}>
                {/* Guardar categoría (si hay cambio) */}
                {isDirtyCategory && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleCategorySave}
                    style={{
                      width: '100%', height: 40,
                      padding: '0 18px',
                      border: '1px solid var(--ink)',
                      background: 'var(--ink)', color: 'var(--paper)',
                      cursor: isSaving ? 'default' : 'pointer',
                      fontFamily: 'var(--sans)', fontSize: 13,
                      opacity: isSaving ? 0.6 : 1,
                      transition: 'opacity 150ms ease',
                      borderRadius: 0,
                    }}
                  >
                    {isSaving ? 'Guardando...' : 'Guardar categoría'}
                  </button>
                )}

                {/* Confirmar enlace ai_proposed */}
                {aiProposed && !confirmed && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleConfirm}
                    onMouseEnter={e => { if (!isSaving) e.currentTarget.style.background = 'var(--ink)'; e.currentTarget.style.color = 'var(--paper)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink)' }}
                    style={{
                      width: '100%', height: 40,
                      padding: '0 18px',
                      border: '1px solid var(--ink)',
                      background: 'transparent', color: 'var(--ink)',
                      cursor: isSaving ? 'default' : 'pointer',
                      fontFamily: 'var(--sans)', fontSize: 13,
                      opacity: isSaving ? 0.6 : 1,
                      transition: 'background 150ms ease, color 150ms ease, opacity 150ms ease',
                      borderRadius: 0,
                    }}
                  >
                    {isSaving ? 'Confirmando...' : 'Confirmar enlace'}
                  </button>
                )}

                {/* Enlazar manualmente (solo si no hay cargo de ningún tipo) */}
                {!confirmed && !aiProposed && (
                  <button
                    type="button"
                    onClick={() => setLinkPanelOpen(o => !o)}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--ink)'; e.currentTarget.style.color = 'var(--paper)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink)' }}
                    style={{
                      width: '100%', height: 40, padding: '0 18px',
                      border: '1px solid var(--ink)',
                      background: 'transparent', color: 'var(--ink)',
                      cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 13,
                      transition: 'background 150ms ease, color 150ms ease',
                      borderRadius: 0,
                    }}
                  >
                    {linkPanelOpen ? 'Cancelar búsqueda' : 'Enlazar cargo de Control'}
                  </button>
                )}
              </div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
