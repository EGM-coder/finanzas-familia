'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type CandidateTxn = {
  id: string
  date: string
  amount: number
  counterparty: string | null
  description: string | null
}

// Confirmar un cargo ai_proposed
export async function confirmMatch(
  chargeId: string,
  orderId: string,
  isFinanced: boolean,
  transactionId: string,
  categoryId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()

  const { error: chargeErr } = await supabase
    .from('purchase_order_charges')
    .update({ match_method: 'confirmed' })
    .eq('id', chargeId)
  if (chargeErr) return { ok: false, error: 'Error al confirmar el enlace' }

  // match_status: 'completo' si pago único, 'parcial' si financiado (T-026 cierra cuotas)
  const { error: orderErr } = await supabase
    .from('purchase_orders')
    .update({ match_status: isFinanced ? 'parcial' : 'completo' })
    .eq('id', orderId)
  if (orderErr) return { ok: false, error: 'Error al actualizar estado del pedido' }

  // D-005: si hay categoría, volcamos al cargo (transactions) en el momento del enlace
  if (categoryId) {
    await supabase
      .from('transactions')
      .update({ category_id: categoryId })
      .eq('id', transactionId)
  }

  revalidatePath('/pedidos')
  return { ok: true }
}

// Enlazar manualmente un cargo de Control a un pedido sin enlazar
export async function linkManual(
  orderId: string,
  transactionId: string,
  isFinanced: boolean,
  lineCategoryId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()

  // UNIQUE index: un cargo solo puede pertenecer a un pedido
  const { data: existing } = await supabase
    .from('purchase_order_charges')
    .select('id')
    .eq('transaction_id', transactionId)
    .limit(1)
  if (existing && existing.length > 0) {
    return { ok: false, error: 'Este cargo ya está enlazado a otro pedido.' }
  }

  const { error: chargeErr } = await supabase
    .from('purchase_order_charges')
    .insert({ order_id: orderId, transaction_id: transactionId, match_method: 'manual' })
  if (chargeErr) return { ok: false, error: 'Error al enlazar el cargo' }

  // D-005: volcar categoría provisional de la línea al cargo en el momento del enlace
  const txUpdate: Record<string, unknown> = { order_id: orderId }
  if (lineCategoryId) txUpdate.category_id = lineCategoryId

  await supabase.from('transactions').update(txUpdate).eq('id', transactionId)
  await supabase
    .from('purchase_orders')
    .update({ match_status: isFinanced ? 'parcial' : 'completo' })
    .eq('id', orderId)

  revalidatePath('/pedidos')
  return { ok: true }
}

// D-005: fuente única de categoría
// Enlazado → escribe transactions.category_id del cargo
// No enlazado → escribe purchase_order_lines.category_id (provisional)
export async function updateOrderCategory(
  orderId: string,
  categoryId: string | null,
  transactionId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()

  if (transactionId) {
    const { error } = await supabase
      .from('transactions')
      .update({ category_id: categoryId })
      .eq('id', transactionId)
    if (error) return { ok: false, error: 'Error al guardar la categoría' }
  } else {
    const { error } = await supabase
      .from('purchase_order_lines')
      .update({ category_id: categoryId, category_confirmed: categoryId !== null })
      .eq('order_id', orderId)
    if (error) return { ok: false, error: 'Error al guardar la categoría' }
  }

  revalidatePath('/pedidos')
  return { ok: true }
}

// Búsqueda de candidatos de Control para enlace manual
// Devuelve transacciones con order_id null en ±15 días del pedido
export async function searchCandidates(
  dateRef: string,
  q: string,
): Promise<CandidateTxn[]> {
  const supabase = await createClient()

  const d = new Date(dateRef + 'T00:00:00Z')
  const from = new Date(d); from.setUTCDate(d.getUTCDate() - 15)
  const to = new Date(d);   to.setUTCDate(d.getUTCDate() + 7)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('transactions')
    .select('id, date, amount, counterparty, description')
    .is('order_id', 'null')
    .gte('date', from.toISOString().slice(0, 10))
    .lte('date', to.toISOString().slice(0, 10))
    .order('date', { ascending: false })
    .limit(60)

  if (q.trim()) {
    query = query.ilike('counterparty', `%${q.trim()}%`)
  }

  const { data } = await query
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    date: r.date as string,
    amount: Number(r.amount),
    counterparty: (r.counterparty as string | null) ?? null,
    description: (r.description as string | null) ?? null,
  }))
}
