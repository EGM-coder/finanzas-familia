'use client'

import { Drawer } from 'vaul'

/**
 * CategorizationDrawer — slide-from-right drawer para categorizar transacciones.
 * Fase 3, Paso 3: esqueleto. Lógica de campos en pasos 5-6, server actions en 7-8.
 *
 * Lenguaje visual EGMFin (doctrina pura):
 * - sin border-radius, sin box-shadow
 * - overlay sólido fade (no backdrop blur)
 * - tipografía Newsreader (display) + Geist (controls)
 * - ancho 480px desktop, full-width mobile
 *
 * Vaul aporta gratis: drag-to-close, focus trap, esc, click-outside, accesibilidad.
 */

type TransactionRow = {
  id: string
  date: string
  amount: number
  currency: string
  counterparty: string | null
  raw_concept: string | null
  description: string | null
}

interface Props {
  transaction: TransactionRow | null   // null = cerrado
  onClose: () => void
}

export function CategorizationDrawer({ transaction, onClose }: Props) {
  const isOpen = transaction !== null

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
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '480px',
            maxWidth: '100vw',
            background: 'var(--paper)',
            borderLeft: '1px solid var(--rule)',
            borderRadius: 0,
            boxShadow: 'none',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            zIndex: 51,
            overflowY: 'auto',
            outline: 'none',
          }}
          aria-describedby={undefined}
        >
          {/* Vaul handle visual oculto (doctrina EGMFin) */}
          <div style={{ display: 'none' }}>
            <Drawer.Handle />
          </div>

          {/* Header */}
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Drawer.Title style={{
              fontFamily: 'var(--serif)',
              fontSize: 24,
              fontWeight: 400,
              color: 'var(--ink-1)',
              margin: 0,
              letterSpacing: '-0.01em',
            }}>
              Categorizar
            </Drawer.Title>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--sans)',
                fontSize: 13,
                color: 'var(--ink-3)',
                padding: 0,
              }}
              aria-label="Cerrar"
            >
              Esc
            </button>
          </header>

          {/* Contexto de la transacción (read-only) */}
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
                <span style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {transaction.date}
                </span>
                <span className="num" style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 18,
                  color: transaction.amount < 0 ? 'var(--ink-1)' : 'var(--positive, var(--ink-1))',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {transaction.amount.toLocaleString('es-ES', { style: 'currency', currency: transaction.currency || 'EUR' })}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--ink-2)' }}>
                {transaction.counterparty || transaction.description || '—'}
              </div>
              {transaction.raw_concept && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)' }}>
                  {transaction.raw_concept}
                </div>
              )}
            </section>
          )}

          {/* PASO 5: combobox Categorías (placeholder) */}
          <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-4)' }}>
            [Paso 5] Categoría · combobox jerárquico solo hojas
          </div>

          {/* PASO 6: campos restantes (placeholders) */}
          <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-4)' }}>
            [Paso 6] Proyecto · combobox creatable
          </div>
          <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-4)' }}>
            [Paso 6] Naturaleza · select (5 valores schema)
          </div>
          <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-4)' }}>
            [Paso 6] Titular · radio tri-state (eric / ana / compartido)
          </div>
          <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-4)' }}>
            [Paso 6] Reembolsable Nordex · checkbox (disabled si titular≠eric)
          </div>

          {/* PASO 8: "Guardar como regla" (placeholder expandible) */}
          <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-4)', marginTop: 'auto' }}>
            [Paso 8] Guardar como regla · expandible
          </div>

          {/* Footer · botones (lógica en Paso 7) */}
          <footer style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            paddingTop: 16,
            borderTop: '1px solid var(--rule)',
          }}>
            <button
              onClick={onClose}
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '8px 14px',
                background: 'transparent',
                border: '1px solid var(--rule)',
                borderRadius: 0,
                color: 'var(--ink-3)',
                cursor: 'pointer',
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
                padding: '8px 14px',
                background: 'var(--ink-1)',
                border: '1px solid var(--ink-1)',
                borderRadius: 0,
                color: 'var(--paper)',
                cursor: 'not-allowed',
                opacity: 0.4,
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
