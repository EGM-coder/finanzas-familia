'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { NatureValue } from '../_components/NatureSelect'

export type MatchField = 'counterparty' | 'raw_concept' | 'description'

type CreateRulePayload = {
  match_field: MatchField
  match_value: string
  set_category_id: string | null
  set_project_id: string | null
  set_nature: NatureValue | null
}

type Result = { ok: true; ruleId: string } | { ok: false; error: string }

export async function createRule(payload: CreateRulePayload): Promise<Result> {
  const trimmed = payload.match_value.trim()
  if (!trimmed) return { ok: false, error: 'El valor de matching no puede estar vacío' }
  if (!payload.set_category_id) return { ok: false, error: 'La regla debe asignar una categoría' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('classification_rules')
    .insert({
      match_field:      payload.match_field,
      match_operator:   'contains',
      match_value:      trimmed,
      set_category_id:  payload.set_category_id,
      set_project_id:   payload.set_project_id,
      set_nature:       payload.set_nature,
      priority:         100,
      is_active:        true,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[createRule] supabase error:', JSON.stringify(error, null, 2))
    return { ok: false, error: 'Error al crear la regla' }
  }

  revalidatePath('/control')
  return { ok: true, ruleId: data.id }
}
