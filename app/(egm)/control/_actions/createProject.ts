'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type ProjectRow = { id: string; name: string; slug: string }
type Result =
  | { ok: true;  project: ProjectRow }
  | { ok: false; error: string }

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

export async function createProject(name: string): Promise<Result> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Nombre inválido' }

  const baseSlug = toSlug(trimmed)
  if (!baseSlug) return { ok: false, error: 'Nombre inválido' }

  const supabase = await createClient()

  const candidates = [baseSlug, ...Array.from({ length: 8 }, (_, i) => `${baseSlug}-${i + 2}`)]

  for (const slug of candidates) {
    const { data, error } = await supabase
      .from('projects')
      .insert({ name: trimmed, slug, status: 'active' })
      .select('id, name, slug')
      .single()

    if (!error) {
      revalidatePath('/control')
      return { ok: true, project: data as ProjectRow }
    }

    if (error.code !== '23505') return { ok: false, error: error.message }
  }

  return { ok: false, error: 'Slug colisión persistente' }
}
