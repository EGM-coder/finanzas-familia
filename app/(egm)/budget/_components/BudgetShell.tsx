'use client'
import { useRef, useState } from 'react'
import { fmtAmount } from '../../_lib/formatters'
import { saveBudgetEntry } from '../actions'
import { type BudgetGroup, type BudgetRowData } from '../page'

// ── Types ────────────────────────────────────────────────────

interface Props {
  grouped:      BudgetGroup[]
  budgets:      BudgetRowData[]
  medianIncome: number | null
  year:         number
  month:        number
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ── Component ─────────────────────────────────────────────────

export function BudgetShell({ grouped, budgets, medianIncome, year, month }: Props) {
  // budgetMap: category_id → amount_planned en DB
  //   !has(id)       → sin fila (no asignado, ZBB base-cero)
  //   get(id) === 0  → fila con 0 (rastro histórico, tratar igual que sin fila)
  //   get(id) > 0    → asignación activa
  const [budgetMap, setBudgetMap] = useState<Map<string, number>>(() => {
    const m = new Map<string, number>()
    for (const b of budgets) {
      m.set(b.category_id, Number(b.amount_planned))
    }
    return m
  })

  // inputValues: lo que hay en cada input (string; vacío si 0 o sin fila)
  const [inputValues, setInputValues] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>()
    for (const b of budgets) {
      if (Number(b.amount_planned) > 0) {
        m.set(b.category_id, String(Number(b.amount_planned)))
      }
    }
    return m
  })

  const [statuses, setStatuses] = useState<Map<string, SaveStatus>>(new Map())
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  function setStatus(catId: string, s: SaveStatus) {
    setStatuses(prev => new Map(prev).set(catId, s))
  }

  async function handleSave(catId: string) {
    const rawVal = (inputValues.get(catId) ?? '').replace(',', '.')
    const parsed = parseFloat(rawVal)
    const amount = isNaN(parsed) || parsed <= 0 ? 0 : Math.round(parsed * 100) / 100

    // DOC ZBB: sin fila + valor 0/vacío → no persistir nada
    if (amount === 0 && !budgetMap.has(catId)) return

    setStatus(catId, 'saving')

    const result = await saveBudgetEntry(year, month, catId, amount)

    if (result.error) {
      setStatus(catId, 'error')
      return
    }

    // Actualizar estado local
    if (amount > 0) {
      setBudgetMap(prev => new Map(prev).set(catId, amount))
      setInputValues(prev => new Map(prev).set(catId, String(amount)))
    } else {
      // Fila existente → marcada como 0 (rastro); input queda vacío
      setBudgetMap(prev => new Map(prev).set(catId, 0))
      setInputValues(prev => { const m = new Map(prev); m.delete(catId); return m })
    }

    setStatus(catId, 'saved')
    const t = saveTimers.current.get(catId)
    if (t) clearTimeout(t)
    saveTimers.current.set(catId, setTimeout(() => setStatus(catId, 'idle'), 1400))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
  }

  // ── Footer: solo amount > 0 cuenta como asignado ──────────
  const asignado = Array.from(budgetMap.values())
    .filter(v => v > 0)
    .reduce((s, v) => s + v, 0)
  const sinAsignar = medianIncome !== null ? medianIncome - asignado : null

  return (
    <div>
      {/* ── Grupos de categorías ── */}
      {grouped.map(({ parent, leaves }) => (
        <div key={parent.id} style={{ marginBottom: 28 }}>
          <div
            className="label"
            style={{
              fontSize: 9,
              color: 'var(--ink-3)',
              paddingBottom: 8,
              marginBottom: 4,
              borderBottom: '1px solid var(--rule)',
            }}
          >
            {parent.name}
          </div>

          {leaves.map(leaf => {
            const status   = statuses.get(leaf.id) ?? 'idle'
            const inputVal = inputValues.get(leaf.id) ?? ''
            const isSaving = status === 'saving'

            return (
              <div
                key={leaf.id}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  padding: '9px 0',
                  borderBottom: '1px solid var(--rule-2)',
                }}
              >
                <span className="roman" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                  {leaf.name}
                </span>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  {/* Indicador de estado — solo texto, sin emojis */}
                  <span
                    className="label"
                    style={{
                      fontSize: 8,
                      minWidth: 28,
                      textAlign: 'right',
                      color: status === 'error' ? 'var(--signal-neg)'
                           : status === 'saved'  ? 'var(--signal-pos)'
                           : 'transparent',
                    }}
                  >
                    {status === 'error' ? 'error' : status === 'saved' ? 'ok' : '.'}
                  </span>

                  <span className="roman" style={{ fontSize: 11, color: 'var(--ink-4)' }}>€</span>

                  <input
                    type="text"
                    inputMode="decimal"
                    value={inputVal}
                    placeholder="0"
                    disabled={isSaving}
                    onChange={e =>
                      setInputValues(prev => new Map(prev).set(leaf.id, e.target.value))
                    }
                    onBlur={() => handleSave(leaf.id)}
                    onKeyDown={handleKeyDown}
                    style={{
                      width: 88,
                      textAlign: 'right',
                      fontFamily: 'var(--mono)',
                      fontSize: 14,
                      fontVariantNumeric: 'tabular-nums',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: `1px solid ${
                        status === 'error'  ? 'var(--signal-neg)'
                        : isSaving         ? 'var(--ink-4)'
                        : status === 'saved' ? 'var(--signal-pos)'
                        : 'var(--rule)'
                      }`,
                      outline: 'none',
                      padding: '2px 0',
                      color: 'var(--ink)',
                      opacity: isSaving ? 0.45 : 1,
                      transition: 'border-color 200ms, opacity 150ms',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* ── Footer fijo ── */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          background: 'var(--bg)',
          borderTop: '1px solid var(--rule)',
          padding: '16px 0 20px',
          marginTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ display: 'flex', gap: 40, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="label" style={{ fontSize: 9, color: 'var(--ink-4)' }}>Asignado</span>
            <span className="num" style={{ fontSize: 22, color: 'var(--ink)' }}>
              {fmtAmount(asignado)}
            </span>
          </div>

          {sinAsignar !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="label" style={{ fontSize: 9, color: 'var(--ink-4)' }}>Sin asignar</span>
              <span
                className="num"
                style={{
                  fontSize: 22,
                  color: sinAsignar < 0 ? 'var(--signal-neg)' : 'var(--ink)',
                }}
              >
                {fmtAmount(sinAsignar)}
              </span>
            </div>
          )}
        </div>

        {medianIncome !== null && (
          <span className="roman" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
            Base: {fmtAmount(medianIncome)} · mediana 3m
          </span>
        )}
      </div>
    </div>
  )
}
