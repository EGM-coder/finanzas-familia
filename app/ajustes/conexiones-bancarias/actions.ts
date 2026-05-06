'use server'

import { createClient } from '@/lib/supabase/server'
import { startConsent, ebFetch } from '@/lib/enable-banking'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function connectBank(formData: FormData): Promise<void> {
  const aspspName    = formData.get('aspsp_name') as string
  const aspspCountry = formData.get('aspsp_country') as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const authState = crypto.randomUUID()

  const { data: bc, error: insertErr } = await supabase
    .from('bank_connections')
    .insert({
      provider:       'enable_banking',
      aspsp_name:     aspspName,
      aspsp_country:  aspspCountry,
      aspsp_psu_type: 'personal',
      auth_state:     authState,
      status:         'pending',
      user_id:        user.id,
    })
    .select('id')
    .single()

  if (insertErr || !bc) {
    console.error('[connectBank] INSERT bank_connections:', insertErr)
    throw new Error('No se pudo registrar la conexión. Inténtalo de nuevo.')
  }

  let consentUrl: string
  try {
    const res = await startConsent({ aspspName, aspspCountry, state: authState })
    consentUrl = res.url
  } catch (err) {
    console.error('[connectBank] startConsent:', err)
    await supabase
      .from('bank_connections')
      .update({ status: 'revoked' })
      .eq('id', bc.id)
    throw new Error('No se pudo iniciar la conexión con el banco. Inténtalo de nuevo.')
  }

  redirect(consentUrl)
}

export async function deleteBankConnection(formData: FormData): Promise<void> {
  const connectionId = formData.get('connection_id') as string
  if (!connectionId) throw new Error('ID de conexión inválido.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: bc, error: selectErr } = await supabase
    .from('bank_connections')
    .select('id, status, consent_session_id, aspsp_name')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .single()

  if (selectErr || !bc) {
    console.error('[deleteBankConnection] SELECT:', selectErr)
    throw new Error('Conexión no encontrada.')
  }

  if (bc.status === 'active' && bc.consent_session_id) {
    try {
      await ebFetch(`/sessions/${bc.consent_session_id}`, { method: 'DELETE' })
    } catch (err) {
      console.warn('[deleteBankConnection] DELETE /sessions (continuamos con borrado local):', err)
    }
  }

  const { error: deleteErr } = await supabase
    .from('bank_connections')
    .delete()
    .eq('id', connectionId)

  if (deleteErr) {
    console.error('[deleteBankConnection] DELETE:', deleteErr)
    throw new Error('No se pudo eliminar la conexión.')
  }

  revalidatePath('/ajustes/conexiones-bancarias')
}
