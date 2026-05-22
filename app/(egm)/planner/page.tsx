import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MonthSwitcher } from '../control/_components/MonthSwitcher'
import { PlannerShell } from './_components/PlannerShell'

// ── Types ────────────────────────────────────────────────────

export interface PlannerData {
  gastoMes: number       // magnitud de salidas PSD2 (sum |amount < 0|)
  ingresosMes: number    // sum(incomes.net_amount) del mes
  fijosObservados: number // sum(v_fixed_expenses_observed.total_spent) del mes
  balance: number        // ingresosMes - gastoMes
  ahorro: number         // balance - fijosObservados (excedente tras gastos + compromisos fijos)
}

// ── Pure helpers ─────────────────────────────────────────────

function currentMes(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(mes: string): { start: string; end: string; year: number; month: number } {
  const [year, month] = mes.split('-').map(Number)
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end, year, month }
}

function computePlannerData(
  txns: { amount: number }[],
  fixedData: { total_spent: number }[],
  incomesData: { net_amount: number }[],
): PlannerData {
  const gastoMes = txns.reduce(
    (s, r) => (r.amount < 0 ? s + Math.abs(r.amount) : s),
    0,
  )
  const ingresosMes = incomesData.reduce((s, r) => s + Number(r.net_amount), 0)
  const fijosObservados = fixedData.reduce((s, r) => s + Number(r.total_spent), 0)
  const balance = ingresosMes - gastoMes
  const ahorro = balance - fijosObservados
  return { gastoMes, ingresosMes, fijosObservados, balance, ahorro }
}

// ── Page ─────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{ mes?: string }>
}

export default async function PlannerPage({ searchParams }: Props) {
  const params = await searchParams
  const mes = params.mes ?? currentMes()

  if (!/^\d{4}-\d{2}$/.test(mes)) redirect(`/planner?mes=${currentMes()}`)

  const { start, end, year, month } = monthRange(mes)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [txnsRes, fixedObsRes, incomesRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount')
      .eq('source', 'psd2')
      .gte('date', start)
      .lt('date', end),
    supabase
      .from('v_fixed_expenses_observed')
      .select('total_spent')
      .eq('year', year)
      .eq('month', month),
    supabase
      .from('incomes')
      .select('net_amount')
      .gte('date', start)
      .lt('date', end),
  ])

  const data = computePlannerData(
    txnsRes.data ?? [],
    fixedObsRes.data ?? [],
    incomesRes.data ?? [],
  )

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      <div className="label" style={{ marginBottom: 8, color: 'var(--ink-3)' }}>Planner</div>
      <MonthSwitcher mes={mes} />
      <PlannerShell data={data} userId={user.id} />
    </div>
  )
}
