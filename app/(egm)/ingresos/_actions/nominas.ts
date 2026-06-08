'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type IncomeCandidate = {
  id: string
  date: string
  amount: number
  description: string | null
  counterparty: string | null
}

type ActionResult = { ok: true } | { ok: false; error: string }

// ── Helpers ──────────────────────────────────────────────────

/** '2026-01' → { from: '2026-01-01', to: '2026-02-01' } */
function monthBounds(yearMonth: string): { from: string; to: string } {
  const [y, m] = yearMonth.split('-').map(Number)
  const from = `${yearMonth}-01`
  const to =
    m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { from, to }
}

/** '2026-01' → '202601'  (token de mes embebido en la descripción del depósito) */
function toYYYYMM(yearMonth: string): string {
  return yearMonth.replace('-', '')
}

// ── 1. searchCandidates — propone, no asigna ─────────────────

/**
 * Devuelve los depósitos Nordex candidatos para emparejar con el mes dado.
 *
 * Clave verificada: "NOMINA NORDEX ENERGY SPAIN S.A.U SUELDOSALAR...YYYYMM"
 *   → empareja por mes EXPLÍCITO en la descripción, no por importe.
 *
 * Primario:  description ILIKE '%YYYYMM%'
 * Fallback:  date en ventana ±15 d del mes (cuando la descripción no lleva token).
 * Excluye depósitos ya enlazados vía income_charges para este mes.
 */
export async function searchCandidates(
  yearMonth: string,
): Promise<IncomeCandidate[]> {
  const supabase = await createClient()
  const yyyyMM = toYYYYMM(yearMonth)
  const { from: monthFrom, to: monthTo } = monthBounds(yearMonth)

  // Incomes del mes → IDs para calcular los ya enlazados
  const { data: monthIncomes } = await supabase
    .from('incomes')
    .select('id')
    .eq('source', 'nordex_payslip')
    .gte('date', monthFrom)
    .lt('date', monthTo)

  const monthIncomeIds = (monthIncomes ?? []).map((r) => r.id as string)

  const linkedIds = new Set<string>()
  if (monthIncomeIds.length > 0) {
    const { data: linked } = await supabase
      .from('income_charges')
      .select('transaction_id')
      .in('income_id', monthIncomeIds)
    ;(linked ?? []).forEach((r) => linkedIds.add(r.transaction_id as string))
  }

  // Base query: filtros comunes a primario y fallback
  const base = () =>
    supabase
      .from('transactions')
      .select('id, date, amount, description, counterparty')
      .ilike('counterparty', '%NORDEX%')
      .gt('amount', 0)
      .is('order_id', null)
      .is('superseded_by', null)
      .order('date')
      .limit(50)

  // PRIMARY: token de mes en la descripción
  const { data: primary } = await base().ilike('description', `%${yyyyMM}%`)
  let rows = primary ?? []

  // FALLBACK: ventana ±15 d si primario vacío
  if (rows.length === 0) {
    const d0 = new Date(`${monthFrom}T00:00:00Z`)
    const d1 = new Date(`${monthTo}T00:00:00Z`)
    const fallFrom = new Date(d0)
    fallFrom.setUTCDate(d0.getUTCDate() - 15)
    const fallTo = new Date(d1)
    fallTo.setUTCDate(d1.getUTCDate() + 15)

    const { data: fallback } = await base()
      .gte('date', fallFrom.toISOString().slice(0, 10))
      .lte('date', fallTo.toISOString().slice(0, 10))
    rows = fallback ?? []
  }

  return rows
    .filter((r) => !linkedIds.has(r.id as string))
    .map((r) => ({
      id:           r.id as string,
      date:         r.date as string,
      amount:       Number(r.amount),
      description:  (r.description as string | null) ?? null,
      counterparty: (r.counterparty as string | null) ?? null,
    }))
}

// ── 2. confirmMatch — enlace humano, producto cruzado M:N ────

/**
 * Enlaza TODAS las filas incomes del mes con los depósitos seleccionados.
 *
 * Genera el producto cruzado income × depósito:
 *   enero (1 income × 1 depósito)  → 1 fila
 *   mayo  (2 incomes × 1 depósito) → 2 filas
 *   diciembre (3 incomes × 1 dep)  → 3 filas
 *
 * ON CONFLICT (income_id, transaction_id) DO NOTHING: salta duplicados.
 * V1 sin efectos colaterales: no toca category_id ni fields de transactions.
 */
export async function confirmMatch(
  yearMonth: string,
  transactionIds: string[],
): Promise<ActionResult> {
  if (transactionIds.length === 0)
    return { ok: false, error: 'Sin transacciones seleccionadas' }

  const supabase = await createClient()
  const { from: monthFrom, to: monthTo } = monthBounds(yearMonth)

  const { data: incomes, error: incomesErr } = await supabase
    .from('incomes')
    .select('id')
    .eq('source', 'nordex_payslip')
    .gte('date', monthFrom)
    .lt('date', monthTo)

  if (incomesErr)
    return { ok: false, error: 'Error al obtener incomes del mes' }
  if (!incomes || incomes.length === 0)
    return { ok: false, error: `Sin incomes nordex_payslip para ${yearMonth}` }

  // Producto cruzado income × depósito
  const rows = incomes.flatMap((inc) =>
    transactionIds.map((txId) => ({
      income_id:      inc.id as string,
      transaction_id: txId,
      match_method:   'confirmed' as const,
    })),
  )

  const { error } = await supabase
    .from('income_charges')
    .upsert(rows, { onConflict: 'income_id,transaction_id', ignoreDuplicates: true })

  if (error) return { ok: false, error: `Error al enlazar: ${error.message}` }

  revalidatePath('/ingresos')
  return { ok: true }
}

// ── 3a. unlinkMonth — desenlaza todo un mes ──────────────────

/** Elimina todos los income_charges del mes. Reseteo completo del emparejamiento. */
export async function unlinkMonth(yearMonth: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { from: monthFrom, to: monthTo } = monthBounds(yearMonth)

  const { data: monthIncomes } = await supabase
    .from('incomes')
    .select('id')
    .eq('source', 'nordex_payslip')
    .gte('date', monthFrom)
    .lt('date', monthTo)

  const monthIncomeIds = (monthIncomes ?? []).map((r) => r.id as string)
  if (monthIncomeIds.length === 0) return { ok: true }

  const { error } = await supabase
    .from('income_charges')
    .delete()
    .in('income_id', monthIncomeIds)

  if (error) return { ok: false, error: `Error al desenlazar: ${error.message}` }

  revalidatePath('/ingresos')
  return { ok: true }
}

// ── 3b. unlinkCharge — desenlaza un income_charge concreto ───

/** Elimina un income_charge por ID. Para des-emparejamientos selectivos. */
export async function unlinkCharge(chargeId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('income_charges')
    .delete()
    .eq('id', chargeId)

  if (error) return { ok: false, error: `Error al desenlazar: ${error.message}` }

  revalidatePath('/ingresos')
  return { ok: true }
}
