'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function deleteRule(ruleId: string): Promise<Result> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('classification_rules')
    .delete()
    .eq('id', ruleId)

  if (error) {
    console.error('[deleteRule] supabase error:', JSON.stringify(error, null, 2))
    return { ok: false, error: 'Error al borrar la regla' }
  }

  revalidatePath('/control')
  return { ok: true }
}
