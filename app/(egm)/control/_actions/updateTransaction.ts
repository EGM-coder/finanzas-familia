'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { NatureValue } from '../_components/NatureSelect'
import type { TitularValue } from '../_components/TitularRadio'

export type UpdateTransactionPayload = {
  category_id: string | null
  project_id: string | null
  nature: NatureValue | null
  titular: TitularValue
  is_reimbursable: boolean
}

export async function updateTransaction(
  id: string,
  payload: UpdateTransactionPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('transactions')
    .update({
      category_id:    payload.category_id,
      project_id:     payload.project_id,
      nature:         payload.nature,
      titular:        payload.titular,
      is_reimbursable: payload.is_reimbursable,
    })
    .eq('id', id)

  if (error) {
    console.error('[updateTransaction] supabase error:', JSON.stringify(error, null, 2))
    if (error.message.toLowerCase().includes('check constraint')) {
      return { ok: false, error: 'Valor no válido' }
    }
    if (error.code?.startsWith('PGRST')) {
      return { ok: false, error: 'Sin permiso para modificar esta transacción' }
    }
    return { ok: false, error: 'Error al guardar' }
  }

  revalidatePath('/control')
  return { ok: true }
}
