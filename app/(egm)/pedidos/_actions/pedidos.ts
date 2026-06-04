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

// Rechazar propuesta de enlace IA (T-032)
// Solo para match_method='ai_proposed'; no toca transactions.order_id (no se había fijado)
export async function rejectMatch(
  chargeId: string,
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('purchase_order_charges')
    .delete()
    .eq('id', chargeId)
  if (error) return { ok: false, error: 'Error al rechazar la propuesta' }

  await supabase
    .from('purchase_orders')
    .update({ match_status: 'sin_linkar' })
    .eq('id', orderId)

  revalidatePath('/pedidos')
  return { ok: true }
}

// Enlazar manualmente un cargo de Control a un pedido
export async function linkManual(
  orderId: string,
  transactionId: string,
  isFinanced: boolean,
  lineCategoryId: string | null,
  installmentCount: number | null,
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

  // Para financiados: calcular qué número de cuota es esta
  const { data: priorCharges } = isFinanced
    ? await supabase
        .from('purchase_order_charges')
        .select('id')
        .eq('order_id', orderId)
        .in('match_method', ['confirmed', 'manual'])
    : { data: [] as { id: string }[] }

  const priorCount = priorCharges?.length ?? 0
  const nextInstallment = isFinanced ? priorCount + 1 : null

  const { error: chargeErr } = await supabase
    .from('purchase_order_charges')
    .insert({
      order_id: orderId,
      transaction_id: transactionId,
      match_method: 'manual',
      ...(nextInstallment !== null ? { installment_number: nextInstallment } : {}),
    })
  if (chargeErr) return { ok: false, error: 'Error al enlazar el cargo' }

  // D-005: volcar categoría provisional de la línea al cargo en el momento del enlace
  const txUpdate: Record<string, unknown> = { order_id: orderId }
  if (lineCategoryId) txUpdate.category_id = lineCategoryId
  await supabase.from('transactions').update(txUpdate).eq('id', transactionId)

  // Recompute match_status con el nuevo conteo
  const newCount = priorCount + 1
  let matchStatus: string
  if (!isFinanced) {
    matchStatus = 'completo'
  } else if (installmentCount && newCount >= installmentCount) {
    matchStatus = 'completo'
  } else {
    matchStatus = 'parcial'
  }

  await supabase
    .from('purchase_orders')
    .update({ match_status: matchStatus })
    .eq('id', orderId)

  revalidatePath('/pedidos')
  return { ok: true }
}

// Desenlazar un cargo manual de un pedido (D-005 simétrico a linkManual)
export async function unlinkCharge(
  chargeId: string,
  orderId: string,
  transactionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()

  // D-005: leer categoría del cargo antes de borrarlo, para copiarla de vuelta a la línea
  const { data: txn } = await supabase
    .from('transactions')
    .select('category_id')
    .eq('id', transactionId)
    .single()

  const { error: deleteErr } = await supabase
    .from('purchase_order_charges')
    .delete()
    .eq('id', chargeId)
  if (deleteErr) return { ok: false, error: 'Error al desenlazar el cargo' }

  // Limpiar order_id en la transacción
  await supabase
    .from('transactions')
    .update({ order_id: null })
    .eq('id', transactionId)

  // D-005 copy-back: restaurar categoría provisional en las líneas del pedido
  if (txn?.category_id) {
    await supabase
      .from('purchase_order_lines')
      .update({ category_id: txn.category_id })
      .eq('order_id', orderId)
  }

  // Recompute match_status con los cargos restantes
  const [remainingRes, orderRes] = await Promise.all([
    supabase
      .from('purchase_order_charges')
      .select('id')
      .eq('order_id', orderId)
      .in('match_method', ['confirmed', 'manual']),
    supabase
      .from('purchase_orders')
      .select('is_financed, installment_count')
      .eq('id', orderId)
      .single(),
  ])

  const remainingCount = remainingRes.data?.length ?? 0
  const order = orderRes.data

  let matchStatus: string
  if (remainingCount === 0) {
    matchStatus = 'sin_linkar'
  } else if (order?.is_financed && order.installment_count && remainingCount < order.installment_count) {
    matchStatus = 'parcial'
  } else {
    matchStatus = 'completo'
  }

  await supabase
    .from('purchase_orders')
    .update({ match_status: matchStatus })
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
// Filtra salidas (amount<0), mismo rail que el pedido, ventana ±90d ordenada por proximidad de fecha
export async function searchCandidates(
  dateRef: string,
  q: string,
  orderSource: string,
): Promise<CandidateTxn[]> {
  const supabase = await createClient()

  const d = new Date(dateRef + 'T00:00:00Z')
  const from = new Date(d); from.setUTCDate(d.getUTCDate() - 90)
  const to = new Date(d);   to.setUTCDate(d.getUTCDate() + 90)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('transactions')
    .select('id, date, amount, counterparty, description')
    .is('order_id', null)
    .is('superseded_by', null)
    .eq('is_direct_charge', false)
    .lt('amount', 0)
    .gte('date', from.toISOString().slice(0, 10))
    .lte('date', to.toISOString().slice(0, 10))
    .limit(100)

  // Rail filter: solo candidatos del mismo carril (PayPal vs Amazon)
  if (orderSource === 'paypal_email' || orderSource === 'paypal_csv') {
    query = query.or('counterparty.ilike.%paypal%,description.ilike.%paypal%')
  } else if (orderSource === 'amazon_email' || orderSource === 'amazon_csv') {
    query = query.or('counterparty.ilike.%amazon%,description.ilike.%amazon%')
  }

  if (q.trim()) {
    query = query.ilike('counterparty', `%${q.trim()}%`)
  }

  const { data } = await query
  const rows: CandidateTxn[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    date: r.date as string,
    amount: Number(r.amount),
    counterparty: (r.counterparty as string | null) ?? null,
    description: (r.description as string | null) ?? null,
  }))

  // Ordenar por proximidad de fecha respecto al pedido
  const refTime = d.getTime()
  rows.sort((a, b) => {
    const da = Math.abs(new Date(a.date + 'T00:00:00Z').getTime() - refTime)
    const db = Math.abs(new Date(b.date + 'T00:00:00Z').getTime() - refTime)
    return da - db
  })

  return rows
}
