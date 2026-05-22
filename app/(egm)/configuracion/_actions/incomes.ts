'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface IncomePayload {
  date: string
  type: string
  gross_amount: number
  irpf_withheld: number
  ss_withheld: number
  net_amount: number
  employer?: string
  concept?: string
}

export async function createIncome(payload: IncomePayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('incomes')
    .insert({ ...payload, user_id: user.id, source: 'manual' })

  if (error) return { error: error.message }
  revalidatePath('/configuracion')
  return { ok: true }
}

export async function updateIncome(id: string, payload: IncomePayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('incomes')
    .update(payload)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/configuracion')
  return { ok: true }
}
