'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

interface CreatePayload {
  name: string
  parent_id: string | null
  visibility: 'privada_eric' | 'privada_ana' | 'compartida'
  color?: string
}

interface UpdatePayload {
  name?: string
  visibility?: 'privada_eric' | 'privada_ana' | 'compartida'
  color?: string | null
}

export async function createCategory(payload: CreatePayload): Promise<
  { ok: true; category: { id: string; name: string; parent_id: string | null; color: string | null; is_active: boolean } } |
  { ok?: never; error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data, error } = await supabase
    .from('categories')
    .insert({
      name: payload.name.trim(),
      parent_id: payload.parent_id,
      visibility: payload.visibility,
      color: payload.color ?? null,
      is_default: false,
      is_active: true,
    })
    .select('id, name, parent_id, color, is_active')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/configuracion')
  revalidatePath('/control')
  return { ok: true, category: data as { id: string; name: string; parent_id: string | null; color: string | null; is_active: boolean } }
}

export async function updateCategory(id: string, payload: UpdatePayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('categories')
    .update(payload)
    .eq('id', id)
    .eq('is_default', false)

  if (error) return { error: error.message }
  revalidatePath('/configuracion')
  return { ok: true }
}

export async function archiveCategory(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('categories')
    .update({ is_active: false })
    .eq('id', id)
    .eq('is_default', false)

  if (error) return { error: error.message }
  revalidatePath('/configuracion')
  return { ok: true }
}

export async function restoreCategory(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('categories')
    .update({ is_active: true })
    .eq('id', id)
    .eq('is_default', false)

  if (error) return { error: error.message }
  revalidatePath('/configuracion')
  return { ok: true }
}
