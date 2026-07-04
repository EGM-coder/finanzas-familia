'use client'
import { useMemo, useState } from 'react'
import type {
  ComposicionRow, DebitCardInfo, DetalleRow, HoldingRow, ManualHoldingRow, PricePoint, StockOptionRow, TxRow,
} from '../page'
import { AsesorPanel }      from './AsesorPanel'
import { ComposicionPanel } from './ComposicionPanel'
import { ContingenciaPanel } from './ContingenciaPanel'
import { CuentaView }       from './CuentaView'
import { PosicionView }     from './PosicionView'
import { SegmentoView }     from './SegmentoView'

// ── Types ─────────────────────────────────────────────────────────

type Props = {
  rows:                ComposicionRow[]
  totalByTitular:      Record<string, number>
  totalTodo:           number
  stockOptions:        StockOptionRow[]
  holdings:            HoldingRow[]
  detalleRows:         DetalleRow[]
  pricesByTicker:      Record<string, PricePoint[]>
  pricesByIsin:        Record<string, PricePoint[]>
  manualHoldings:      ManualHoldingRow[]
  txnsByAccount:       Record<string, TxRow[]>
  debitCardsByParent:  Record<string, DebitCardInfo[]>
}

type NavFrame =
  | { view: 'overview' }
  | { view: 'segmento'; segmento: string }
  | { view: 'cuenta';   accountId: string; accountName: string; institution: string }
  | { view: 'posicion'; holdingId: string; positionName: string; accountId: string }

// ── Helpers ───────────────────────────────────────────────────────

const LABEL: Record<string, string> = {
  eric: 'Eric', ana: 'Ana', comun: 'Familia', leo: 'Leo', biel: 'Biel',
}
const TITULAR_ORDER = ['eric', 'ana', 'comun', 'leo', 'biel']

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(n))
}

const CARD: React.CSSProperties = {
  borderRadius: 'var(--radius)',
  boxShadow:    'var(--shadow)',
  padding:      '20px 22px',
}

// ── Component ─────────────────────────────────────────────────────

export function CuentasClient({
  rows, totalByTitular, totalTodo,
  stockOptions, holdings,
  detalleRows, pricesByTicker, pricesByIsin, manualHoldings,
  txnsByAccount, debitCardsByParent,
}: Props) {
  const titulares = TITULAR_ORDER.filter(t => totalByTitular[t] != null)
  const [active, setActive]     = useState<string>('todo')
  const [navStack, setNavStack] = useState<NavFrame[]>([{ view: 'overview' }])

  const total       = active === 'todo' ? totalTodo : (totalByTitular[active] ?? 0)
  const activeLabel = active === 'todo' ? 'Todo'    : (LABEL[active] ?? active)
  const frame       = navStack[navStack.length - 1]

  const push = (f: NavFrame) => setNavStack(s => [...s, f])
  const back = () => setNavStack(s => s.length > 1 ? s.slice(0, -1) : s)
  const goTo = (idx: number) => setNavStack(s => s.slice(0, idx + 1))

  // When titular changes, reset nav to overview
  const setActiveTitular = (t: string) => {
    setActive(t)
    setNavStack([{ view: 'overview' }])
  }

  const activeSegmentos = useMemo(() => {
    if (active === 'todo') {
      const map = new Map<string, { segmento: string; orden: number; valor: number }>()
      for (const r of rows) {
        const prev = map.get(r.segmento)
        if (prev) { prev.valor += r.valor }
        else { map.set(r.segmento, { segmento: r.segmento, orden: r.orden, valor: r.valor }) }
      }
      return Array.from(map.values())
    }
    return rows
      .filter(r => r.titular === active)
      .map(({ segmento, orden, valor }) => ({ segmento, orden, valor }))
  }, [rows, active])

  // Breadcrumb labels
  const crumbs = navStack.map(f => {
    if (f.view === 'overview') return 'Vista general'
    if (f.view === 'segmento') return f.segmento
    if (f.view === 'cuenta')   return f.accountName
    return f.positionName
  })

  // ── Content ───────────────────────────────────────────────────

  let content: React.ReactNode

  if (frame.view === 'overview') {
    content = (
      <div
        className="fade fade-2"
        style={{
          display:             'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows:    'minmax(220px, auto) minmax(160px, auto)',
          gap:                 16,
        }}
      >
        {/* U2 — Composición */}
        <div className="card" style={CARD}>
          <ComposicionPanel
            segmentos={activeSegmentos}
            total={total}
            titularLabel={activeLabel}
            onSelectSegment={seg => push({ view: 'segmento', segmento: seg })}
          />
        </div>

        {/* U3 — Performance */}
        <div className="card" style={{ ...CARD, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span className="label">Performance</span>
          <span className="roman" style={{ fontSize: 11, alignSelf: 'flex-end' }}>—</span>
        </div>

        {/* U8 — Asesor */}
        <div className="card" style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
          <AsesorPanel
            holdings={holdings}
            active={active}
            total={total}
            activeSegmentos={activeSegmentos}
          />
        </div>

        {/* U5 — Contingente */}
        <div className="card" style={{ ...CARD, borderLeft: '2px solid var(--ink-3)' }}>
          <ContingenciaPanel
            options={stockOptions}
            active={active}
            activeLabel={activeLabel}
          />
        </div>
      </div>
    )
  } else if (frame.view === 'segmento') {
    const segTotal = activeSegmentos.find(s => s.segmento === frame.segmento)?.valor ?? 0
    content = (
      <div className="card fade fade-2" style={{ ...CARD, maxWidth: 640 }}>
        <SegmentoView
          detalleRows={detalleRows}
          active={active}
          activeLabel={activeLabel}
          segmento={frame.segmento}
          segmentoTotal={segTotal}
          total={total}
          onSelectAccount={(accountId, accountName, institution) =>
            push({ view: 'cuenta', accountId, accountName, institution })
          }
        />
      </div>
    )
  } else if (frame.view === 'cuenta') {
    content = (
      <div className="card fade fade-2" style={{ ...CARD, maxWidth: 640 }}>
        <CuentaView
          accountId={frame.accountId}
          detalleRows={detalleRows}
          holdings={holdings}
          manualHoldings={manualHoldings}
          txnsByAccount={txnsByAccount}
          debitCards={debitCardsByParent[frame.accountId] ?? []}
          onSelectPosition={(holdingId, positionName) =>
            push({ view: 'posicion', holdingId, positionName, accountId: frame.accountId })
          }
        />
      </div>
    )
  } else {
    // posicion
    const holding = holdings.find(h => h.id === frame.holdingId)
    content = (
      <div className="card fade fade-2" style={{ ...CARD, maxWidth: 640 }}>
        {holding ? (
          <PosicionView
            holding={holding}
            pricesByTicker={pricesByTicker}
            pricesByIsin={pricesByIsin}
          />
        ) : (
          <div className="roman" style={{ fontSize: 13, color: 'var(--ink-4)' }}>
            Posición no encontrada
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '34px 50px 28px', display: 'flex', flexDirection: 'column' }}>

      {/* ── Cabecera ──────────────────────────────────────────── */}
      <div className="fade" style={{ marginBottom: 20 }}>
        <div className="label">Cuentas · {activeLabel}</div>
        <div className="display num" style={{ fontSize: 72, letterSpacing: '-0.025em', lineHeight: 1.02, marginTop: 4 }}>
          {fmt(total)}
          <span className="display" style={{ fontSize: 28, color: 'var(--ink-3)' }}> €</span>
        </div>
        <div className="display-it" style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6 }}>
          líquido + inversión · patrimonio completo en Inicio
        </div>
      </div>

      {/* ── Espina por titular ────────────────────────────────── */}
      <div className="fade fade-1" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
        {(['todo', ...titulares] as string[]).map(t => {
          const isActive = active === t
          return (
            <button
              key={t}
              onClick={() => setActiveTitular(t)}
              className={isActive ? 'btn btn-fill' : 'btn'}
              style={{ padding: '6px 16px', fontSize: 11, letterSpacing: '0.1em' }}
            >
              {t === 'todo' ? 'Todo' : (LABEL[t] ?? t)}
            </button>
          )
        })}
      </div>

      <div className="rule" style={{ marginBottom: navStack.length > 1 ? 14 : 24 }} />

      {/* ── Breadcrumb + back ─────────────────────────────────── */}
      {navStack.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <button
            onClick={back}
            className="btn"
            style={{ padding: '4px 12px', fontSize: 10, letterSpacing: '0.1em' }}
          >
            ← Atrás
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {i > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>›</span>
                )}
                {i < crumbs.length - 1 ? (
                  <button
                    onClick={() => goTo(i)}
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      fontSize: 11, color: 'var(--ink-3)',
                      fontFamily: 'var(--sans)', fontWeight: 500,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}
                  >
                    {c}
                  </button>
                ) : (
                  <span className="label" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{c}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Content area ──────────────────────────────────────── */}
      {content}
    </div>
  )
}
