import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NominasShell } from './_components/NominasShell'
import { searchCandidates } from './_actions/nominas'
import type { MonthEntry, LinkedTxn, IncomeRow, IncomeCandidate } from './_components/types'

export default async function IngresosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Fetch paralelo: overview + incomes + charges ──────────
  const [reconRes, incomesRes, chargesRes] = await Promise.all([
    supabase
      .from('v_income_reconciliation')
      .select('mes, incomes_net, linked_dep, n_incomes, n_linked, status')
      .order('mes', { ascending: false }),
    supabase
      .from('incomes')
      .select('id, type, net_amount, concept, date')
      .eq('source', 'nordex_payslip')
      .order('date', { ascending: false }),
    supabase
      .from('income_charges')
      .select('income_id, transaction_id'),
  ])

  if (reconRes.error) throw new Error(reconRes.error.message)

  const reconRows   = reconRes.data  ?? []
  const allIncomes  = incomesRes.data ?? []
  const allCharges  = chargesRes.data ?? []

  // ── Detalles de transacciones enlazadas ───────────────────
  const txIds = [...new Set(allCharges.map(c => c.transaction_id as string))]
  const txnMap: Record<string, LinkedTxn> = {}
  if (txIds.length > 0) {
    const { data: txns } = await supabase
      .from('transactions')
      .select('id, date, amount, description')
      .in('id', txIds)
    for (const t of txns ?? []) {
      txnMap[t.id as string] = {
        id:          t.id as string,
        date:        t.date as string,
        amount:      Number(t.amount),
        description: (t.description as string | null) ?? null,
      }
    }
  }

  // ── Candidatos para meses pendientes (paralelo) ───────────
  const pendingMonths = reconRows
    .filter(r => r.status === 'pendiente')
    .map(r => r.mes as string)

  const candidateResults = await Promise.all(
    pendingMonths.map(mes => searchCandidates(mes)),
  )
  const candidatesByMes: Record<string, IncomeCandidate[]> = {}
  pendingMonths.forEach((mes, i) => { candidatesByMes[mes] = candidateResults[i] })

  // ── Grouping: incomes y linked transactions por mes ───────

  const incDateById: Record<string, string> = {}
  const incomesByMes: Record<string, IncomeRow[]> = {}
  for (const inc of allIncomes) {
    const id  = inc.id as string
    const dt  = inc.date as string
    incDateById[id] = dt
    const mes = dt.slice(0, 7)
    ;(incomesByMes[mes] ??= []).push({
      id:         id,
      type:       inc.type as string,
      net_amount: Number(inc.net_amount),
      concept:    inc.concept as string,
    })
  }

  const linkedByMes: Record<string, LinkedTxn[]> = {}
  for (const charge of allCharges) {
    const incDate = incDateById[charge.income_id as string]
    if (!incDate) continue
    const mes = incDate.slice(0, 7)
    const txn = txnMap[charge.transaction_id as string]
    if (!txn) continue
    const bucket = (linkedByMes[mes] ??= [])
    if (!bucket.some(t => t.id === txn.id)) bucket.push(txn)
  }

  // ── Ensamblar MonthEntry[] ────────────────────────────────
  const entries: MonthEntry[] = reconRows.map(r => ({
    mes:        r.mes as string,
    incomes_net: Number(r.incomes_net),
    linked_dep: Number(r.linked_dep),
    n_incomes:  Number(r.n_incomes),
    n_linked:   Number(r.n_linked),
    status:     r.status as MonthEntry['status'],
    incomeRows: incomesByMes[r.mes as string] ?? [],
    linkedTxns: linkedByMes[r.mes as string] ?? [],
    candidates: candidatesByMes[r.mes as string] ?? [],
  }))

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '34px 32px 80px' }}>
      <div className="label" style={{ marginBottom: 4, color: 'var(--ink-3)' }}>
        II · Ingresos
      </div>
      <div className="display" style={{ fontSize: 28, marginTop: 4, marginBottom: 32 }}>
        Nóminas
      </div>
      <NominasShell entries={entries} />
    </div>
  )
}
