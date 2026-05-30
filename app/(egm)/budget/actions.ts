'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Persiste una entrada de presupuesto para una categoría hoja.
 *
 * Reglas doctrinales ZBB:
 *  - amount > 0  → UPSERT ON CONFLICT (year, month, category_id, visibility)
 *  - amount = 0  → UPDATE a 0 si la fila existe; no-op si no existe (garantizado por el caller)
 * visibility hardcoded 'compartida' en v1.
 */
export async function saveBudgetEntry(
  year: number,
  month: number,
  categoryId: string,
  amount: number,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  if (amount > 0) {
    const { error } = await supabase
      .from('budgets')
      .upsert(
        { year, month, category_id: categoryId, visibility: 'compartida', amount_planned: amount },
        { onConflict: 'year,month,category_id,visibility' },
      )
    if (error) return { error: error.message }
  } else {
    // amount = 0: UPDATE fila existente a 0. Si no existe, 0 rows affected (no-op correcto).
    const { error } = await supabase
      .from('budgets')
      .update({ amount_planned: 0 })
      .eq('year', year)
      .eq('month', month)
      .eq('category_id', categoryId)
      .eq('visibility', 'compartida')
    if (error) return { error: error.message }
  }

  revalidatePath('/budget')
  return { ok: true }
}
