import type { SupabaseClient } from '@supabase/supabase-js'

export interface HistoryPoint {
  date: string
  value: number
}

export async function fetchPatrimonioHistory(
  supabase: SupabaseClient
): Promise<HistoryPoint[]> {
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceStr = since.toISOString().slice(0, 10)

  const { data } = await supabase
    .from('patrimonio_snapshots')
    .select('snapshot_date, patrimonio_neto_actual')
    .gte('snapshot_date', sinceStr)
    .order('snapshot_date', { ascending: true })

  return (data ?? []).map(row => ({
    date: row.snapshot_date,
    value: Number(row.patrimonio_neto_actual),
  }))
}
