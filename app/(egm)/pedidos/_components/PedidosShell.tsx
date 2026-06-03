'use client'

import { useState } from 'react'
import { PedidoDrawer } from './PedidoDrawer'
import type { Category } from '@/app/(egm)/control/_components/CategoryCombobox'
import type { Pedido } from './types'

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
  return ({ amazon_email: 'Amazon', amazon_csv: 'Amazon CSV', paypal_email: 'PayPal', paypal_csv: 'PayPal CSV', manual: 'Manual' } as Record<string,string>)[source] ?? source
}

function enlaceIndicator(order: Pedido): '○' | '◐' | '●' {
  if (order.match_status === 'completo') return '●'
  if (order.match_status === 'parcial') return '◐'
  return '○'
}

function enlaceLabel(order: Pedido): string {
  if (order.match_status === 'completo') return 'enlazado'
  if (order.match_status === 'parcial') return 'enlace parcial'
  const hasProp = order.purchase_order_charges.some(c => c.match_method === 'ai_proposed')
  return hasProp ? 'confirmar enlace' : 'sin enlazar'
}

function pagoLabel(order: Pedido): string | null {
  if (!order.is_financed || !order.installment_count) return null
  const n = order.purchase_order_charges.filter(
    c => c.match_method === 'confirmed' || c.match_method === 'manual',
  ).length
  const m = order.installment_count
  if (n >= m) return '● pagado'
  return `pagando ${n}/${m}`
}

function clasificacionOk(order: Pedido): boolean {
  const conf = order.purchase_order_charges.find(
    c => c.match_method === 'confirmed' || c.match_method === 'manual',
  )
  if (conf) return conf.transactions?.category_id !== null
  return order.purchase_order_lines.some(l => l.category_id !== null)
}

// ── Component ─────────────────────────────────────────────────

interface Props {
  orders: Pedido[]
  categories: Category[]
}

export function PedidosShell({ orders, categories }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedOrder = selectedId ? (orders.find(o => o.id === selectedId) ?? null) : null

  const nCompleto = orders.filter(o => o.match_status === 'completo').length
  const nParcial  = orders.filter(o => o.match_status === 'parcial').length

  return (
    <>
      {/* Resumen */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 24, alignItems: 'baseline' }}>
        <span className="label">{orders.length} pedidos</span>
        <span className="roman" style={{ fontSize: 12 }}>
          {nCompleto} enlazados
          {nParcial > 0 && (
            <> · <span style={{ color: 'var(--signal-warn)' }}>{nParcial} enlace parcial</span></>
          )}
        </span>
      </div>

      {/* Lista */}
      <div style={{ borderTop: '1px solid var(--rule)' }}>
        {orders.map(order => {
          const indicator   = enlaceIndicator(order)
          const enlaceTxt   = enlaceLabel(order)
          const pagoTxt     = pagoLabel(order)
          const clasificado  = clasificacionOk(order)
          const isPending   = order.match_status === 'sin_linkar' &&
            order.purchase_order_charges.some(c => c.match_method === 'ai_proposed')

          return (
            <button
              key={order.id}
              type="button"
              onClick={() => setSelectedId(order.id)}
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: '18px 1fr auto',
                gap: 16,
                padding: '14px 4px',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                borderBottom: '1px solid var(--rule-2)',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                alignItems: 'center',
                transition: 'background 120ms ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Indicador enlace ○/◐/● */}
              <span
                className="num"
                aria-label={enlaceTxt}
                style={{ color: 'var(--ink-3)', fontSize: 13, lineHeight: 1, userSelect: 'none' }}
              >
                {indicator}
              </span>

              {/* Cuerpo */}
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500,
                    color: 'var(--ink-1)', lineHeight: 1.3,
                  }}>
                    {order.merchant ?? order.source_order_id ?? '—'}
                  </span>
                  <span className="label" style={{ fontSize: 9, color: 'var(--ink-4)' }}>
                    {sourceLabel(order.source)}
                  </span>
                  <span className="label" style={{ fontSize: 9, color: isPending ? 'var(--signal-warn)' : 'var(--ink-3)' }}>
                    · {enlaceTxt}
                  </span>
                </div>
                {/* Segunda línea: fecha · cuotas · pago · clasificación */}
                <div className="roman" style={{ fontSize: 12, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <span>{fmtDate(order.order_date)}</span>
                  {order.is_financed && order.installment_count && (
                    <span>· {order.installment_count}&thinsp;×&thinsp;<span className="num">{fmtAmount(order.installment_amount ?? 0)}</span>&thinsp;€</span>
                  )}
                  {pagoTxt && (
                    <span style={{ color: 'var(--ink-3)' }}>· {pagoTxt}</span>
                  )}
                  <span style={{ color: clasificado ? 'var(--ink-3)' : 'var(--signal-warn)' }}>
                    · {clasificado ? '● cat.' : '◐ sin cat.'}
                  </span>
                </div>
              </div>

              {/* Importe */}
              <span className="num" style={{ fontSize: 15, color: 'var(--ink-1)', flexShrink: 0 }}>
                {fmtAmount(order.total_amount)}&thinsp;€
              </span>
            </button>
          )
        })}

        {orders.length === 0 && (
          <div className="roman" style={{
            textAlign: 'center', padding: '56px 0', fontSize: 15,
            color: 'var(--ink-3)',
          }}>
            Sin pedidos importados.
          </div>
        )}
      </div>

      <PedidoDrawer
        order={selectedOrder}
        categories={categories}
        onClose={() => setSelectedId(null)}
      />
    </>
  )
}
