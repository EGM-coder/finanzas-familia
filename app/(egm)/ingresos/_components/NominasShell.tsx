'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { confirmMatch, unlinkMonth } from '../_actions/nominas'
import type { MonthEntry, LinkedTxn, IncomeRow, IncomeCandidate } from './types'

// ── Helpers ──────────────────────────────────────────────────

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre']
const MESES_ROM = ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii']

function mesLabel(s: string): string {
  const [y, m] = s.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}

function fmtDate(s: string): string {
  const [y, m, d] = s.split('-').map(Number)
  return `${d}·${MESES_ROM[m - 1]}·${String(y).slice(-2)}`
}

function fmtAmt(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.01
}

// ── Dot indicator ─────────────────────────────────────────────

function dot(status: MonthEntry['status']): string {
  return { cuadrado: '●', parcial: '◐', pendiente: '○', sin_contraparte: '–' }[status]
}

// ── Sub-components ────────────────────────────────────────────

function IncomeBreakdown({ rows }: { rows: IncomeRow[] }) {
  if (rows.length <= 1) return null
  return (
    <div style={{ marginTop: 8 }}>
      {rows.map(r => (
        <div key={r.id} style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', gap: 16,
          paddingBlock: 2,
        }}>
          <span className="roman" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {r.concept}
          </span>
          <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)', flexShrink: 0 }}>
            {fmtAmt(r.net_amount)}&thinsp;€
          </span>
        </div>
      ))}
      <div className="rule-dot" style={{ marginBlock: 6 }} />
    </div>
  )
}

function LinkedDeposit({ txn }: { txn: LinkedTxn }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
      <span className="roman" style={{ fontSize: 12, color: 'var(--ink-2)' }}>
        depósito&thinsp;{fmtDate(txn.date)}
      </span>
      <span className="num" style={{ fontSize: 13, color: 'var(--ink-1)' }}>
        {fmtAmt(txn.amount)}&thinsp;€
      </span>
    </div>
  )
}

function CandidateRow({
  c,
  incomesNet,
  onConfirm,
  isPending,
}: {
  c: IncomeCandidate
  incomesNet: number
  onConfirm: (id: string) => void
  isPending: boolean
}) {
  const cuadra = near(c.amount, incomesNet)
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
      <span className="roman" style={{ fontSize: 12, color: 'var(--ink-2)' }}>
        {fmtDate(c.date)}
      </span>
      <span className="num" style={{ fontSize: 13, color: 'var(--ink-1)' }}>
        {fmtAmt(c.amount)}&thinsp;€
      </span>
      {cuadra && (
        <span className="roman" style={{ fontSize: 11, color: 'var(--signal-pos)' }}>
          cuadra
        </span>
      )}
      <button
        className="btn"
        style={{ padding: '4px 10px', fontSize: 11 }}
        onClick={() => onConfirm(c.id)}
        disabled={isPending}
      >
        Confirmar
      </button>
    </div>
  )
}

// ── Main shell ────────────────────────────────────────────────

interface Props {
  entries: MonthEntry[]
}

export function NominasShell({ entries }: Props) {
  const [isPending, startTransition] = useTransition()

  const nCuadrado  = entries.filter(e => e.status === 'cuadrado').length
  const nPendiente = entries.filter(e => e.status === 'pendiente').length
  const nParcial   = entries.filter(e => e.status === 'parcial').length

  function handleConfirm(mes: string, txIds: string[]) {
    startTransition(async () => {
      const res = await confirmMatch(mes, txIds)
      if (!res.ok) toast.error(res.error)
      else toast.success(`${mesLabel(mes)} enlazado`)
    })
  }

  function handleUnlink(mes: string) {
    startTransition(async () => {
      const res = await unlinkMonth(mes)
      if (!res.ok) toast.error(res.error)
      else toast.success(`Enlace de ${mesLabel(mes)} deshecho`)
    })
  }

  return (
    <>
      {/* Resumen */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 24, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className="label">{entries.length} meses</span>
        <span className="roman" style={{ fontSize: 12 }}>
          {nCuadrado > 0 && <>{nCuadrado} cuadrado{nCuadrado > 1 ? 's' : ''}</>}
          {nParcial  > 0 && <> · <span style={{ color: 'var(--signal-warn)' }}>{nParcial} parcial{nParcial > 1 ? 'es' : ''}</span></>}
          {nPendiente > 0 && <> · <span style={{ color: 'var(--ink-2)' }}>{nPendiente} pendiente{nPendiente > 1 ? 's' : ''}</span></>}
        </span>
      </div>

      {/* Lista */}
      <div style={{ borderTop: '1px solid var(--rule)' }}>
        {entries.map(entry => {
          const muted = entry.status === 'sin_contraparte'
          const inkMain  = muted ? 'var(--ink-4)' : 'var(--ink-1)'
          const inkSub   = muted ? 'var(--ink-4)' : 'var(--ink-3)'

          // ── Acción confirmación multi-candidato ──────────────
          const allCandidateIds = entry.candidates.map(c => c.id)
          const totalCandidates = entry.candidates.reduce((s, c) => s + c.amount, 0)
          const multiCuadra     = near(totalCandidates, entry.incomes_net)

          return (
            <div
              key={entry.mes}
              style={{
                display: 'grid',
                gridTemplateColumns: '16px 1fr auto',
                gap: 14,
                padding: '16px 4px',
                borderBottom: '1px solid var(--rule-2)',
                alignItems: 'start',
                opacity: muted ? 0.55 : 1,
              }}
            >
              {/* Dot */}
              <span
                className="num"
                style={{ fontSize: 13, color: inkSub, lineHeight: 1.7, userSelect: 'none' }}
              >
                {dot(entry.status)}
              </span>

              {/* Body */}
              <div>
                {/* Mes label */}
                <span style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: 15,
                  fontWeight: 400,
                  color: inkMain,
                  letterSpacing: '-0.005em',
                }}>
                  {mesLabel(entry.mes)}
                </span>

                {/* Status line */}
                <div className="roman" style={{ fontSize: 12, color: inkSub, marginTop: 2 }}>
                  {entry.status === 'sin_contraparte' && 'sin contraparte · pre-PSD2'}
                  {entry.status === 'cuadrado' && 'cuadrado'}
                  {entry.status === 'parcial'  && (
                    <>enlace parcial · falta{' '}
                      <span className="num">{fmtAmt(entry.incomes_net - entry.linked_dep)}</span>
                      {' '}€
                    </>
                  )}
                  {entry.status === 'pendiente' && 'pendiente'}
                </div>

                {/* ── Cuadrado: desglose M:N + depósito enlazado ── */}
                {entry.status === 'cuadrado' && (
                  <div style={{ marginTop: 8 }}>
                    <IncomeBreakdown rows={entry.incomeRows} />
                    {entry.linkedTxns.map(t => (
                      <LinkedDeposit key={t.id} txn={t} />
                    ))}
                    <button
                      className="btn btn-ghost"
                      style={{ marginTop: 10, padding: '4px 10px', fontSize: 11 }}
                      onClick={() => handleUnlink(entry.mes)}
                      disabled={isPending}
                    >
                      Deshacer
                    </button>
                  </div>
                )}

                {/* ── Parcial: depósitos enlazados + acción ─────── */}
                {entry.status === 'parcial' && (
                  <div style={{ marginTop: 8 }}>
                    <IncomeBreakdown rows={entry.incomeRows} />
                    {entry.linkedTxns.map(t => (
                      <LinkedDeposit key={t.id} txn={t} />
                    ))}
                    <button
                      className="btn btn-ghost"
                      style={{ marginTop: 10, padding: '4px 10px', fontSize: 11 }}
                      onClick={() => handleUnlink(entry.mes)}
                      disabled={isPending}
                    >
                      Deshacer enlace
                    </button>
                  </div>
                )}

                {/* ── Pendiente: candidatos propuestos ─────────── */}
                {entry.status === 'pendiente' && (
                  <div style={{ marginTop: 8 }}>
                    {entry.candidates.length === 0 && (
                      <span className="roman" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                        sin depósito Nordex encontrado
                      </span>
                    )}

                    {/* Un solo candidato */}
                    {entry.candidates.length === 1 && (
                      <CandidateRow
                        c={entry.candidates[0]}
                        incomesNet={entry.incomes_net}
                        onConfirm={(id) => handleConfirm(entry.mes, [id])}
                        isPending={isPending}
                      />
                    )}

                    {/* Multi-candidato (transferencia fraccionada) */}
                    {entry.candidates.length > 1 && (
                      <>
                        {entry.candidates.map(c => (
                          <div key={c.id} style={{
                            display: 'flex', gap: 12, alignItems: 'baseline',
                            flexWrap: 'wrap', paddingBlock: 2,
                          }}>
                            <span className="roman" style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                              {fmtDate(c.date)}
                            </span>
                            <span className="num" style={{ fontSize: 13, color: 'var(--ink-1)' }}>
                              {fmtAmt(c.amount)}&thinsp;€
                            </span>
                          </div>
                        ))}
                        <div style={{
                          display: 'flex', gap: 12, alignItems: 'baseline',
                          flexWrap: 'wrap', marginTop: 6,
                        }}>
                          <span className="roman" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                            total{' '}
                            <span className="num">{fmtAmt(totalCandidates)}</span>
                            {' '}€
                          </span>
                          {multiCuadra && (
                            <span className="roman" style={{ fontSize: 11, color: 'var(--signal-pos)' }}>
                              cuadra
                            </span>
                          )}
                          <button
                            className="btn"
                            style={{ padding: '4px 10px', fontSize: 11 }}
                            onClick={() => handleConfirm(entry.mes, allCandidateIds)}
                            disabled={isPending}
                          >
                            Confirmar {entry.candidates.length}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Importe total del mes */}
              <span
                className="num"
                style={{
                  fontSize: 15,
                  color: inkMain,
                  flexShrink: 0,
                  paddingTop: 2,
                  lineHeight: 1.7,
                }}
              >
                {fmtAmt(entry.incomes_net)}&thinsp;€
              </span>
            </div>
          )
        })}

        {entries.length === 0 && (
          <div className="roman" style={{
            textAlign: 'center', padding: '56px 0',
            fontSize: 15, color: 'var(--ink-3)',
          }}>
            Sin nóminas importadas.
          </div>
        )}
      </div>
    </>
  )
}
