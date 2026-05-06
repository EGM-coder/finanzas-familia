'use server'

import { createClient } from '@/lib/supabase/server'
import { startConsent } from '@/lib/enable-banking'
import { redirect } from 'next/navigation'

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
