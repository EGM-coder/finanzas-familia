'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Marca o desmarca una transacción como "cargo directo" (T-033).
// Mutuamente excluyente con estar enlazada (order_id != null): la UI
// no debe ofrecer esta acción para transacciones ya vinculadas.
export async function toggleDirectCharge(
  txnId: string,
  value: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('transactions')
    .update({ is_direct_charge: value })
    .eq('id', txnId)

  if (error) return { ok: false, error: 'Error al actualizar el cargo' }

  revalidatePath('/control')
  return { ok: true }
}
