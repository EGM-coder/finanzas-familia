import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CuentasClient } from './_components/CuentasClient'

export type ComposicionRow = {
  titular: string
  segmento: string
  orden: number
  valor: number
}

export type StockOptionRow = {
  package_name:          string
  num_options:           number
  strike_price:          number
  intrinsic_total:       number
  exercise_window_start: string
  exercise_window_end:   string
  condition_met:         boolean
  current_price_eur:     number | null
  price_date:            string | null
}

export type HoldingRow = {
  account_id:        string
  ticker:            string | null
  asset_type:        string
  original_currency: string
  current_value_eur: number | null
  titular:           string
}

export default async function CuentasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [composicionRes, stockOptRes, holdingsRes, accountsRes] = await Promise.all([
    supabase
      .from('v_cuentas_composicion')
      .select('titular, segmento, orden, valor')
      .order('titular')
      .order('orden'),
    supabase
      .from('stock_options_valued')
      .select('package_name, num_options, strike_price, intrinsic_total, exercise_window_start, exercise_window_end, condition_met, current_price_eur, price_date'),
    supabase
      .from('holdings_valued')
      .select('account_id, ticker, asset_type, original_currency, current_value_eur, is_active')
      .eq('is_active', true),
    supabase
      .from('accounts')
      .select('id, titular')
      .eq('is_active', true),
  ])

  if (composicionRes.error) throw composicionRes.error

  const rows: ComposicionRow[] = (composicionRes.data ?? []).map(r => ({
    titular:  r.titular  as string,
    segmento: r.segmento as string,
    orden:    Number(r.orden),
    valor:    Number(r.valor),
  }))

  const totalByTitular: Record<string, number> = {}
  for (const r of rows) {
    totalByTitular[r.titular] = (totalByTitular[r.titular] ?? 0) + r.valor
  }
  const totalTodo = Object.values(totalByTitular).reduce((s, v) => s + v, 0)

  const stockOptions: StockOptionRow[] = (stockOptRes.data ?? []).map(o => ({
    package_name:          o.package_name as string,
    num_options:           Number(o.num_options),
    strike_price:          Number(o.strike_price),
    intrinsic_total:       Number(o.intrinsic_total),
    exercise_window_start: o.exercise_window_start as string,
    exercise_window_end:   o.exercise_window_end   as string,
    condition_met:         Boolean(o.condition_met),
    current_price_eur:     o.current_price_eur != null ? Number(o.current_price_eur) : null,
    price_date:            o.price_date as string | null,
  }))

  // Join holdings with accounts to get titular per holding
  const accountTitular = new Map<string, string>(
    (accountsRes.data ?? []).map(a => [a.id as string, a.titular as string])
  )
  const holdings: HoldingRow[] = (holdingsRes.data ?? [])
    .map(h => ({
      account_id:        h.account_id as string,
      ticker:            h.ticker as string | null,
      asset_type:        h.asset_type as string,
      original_currency: h.original_currency as string,
      current_value_eur: h.current_value_eur != null ? Number(h.current_value_eur) : null,
      titular:           accountTitular.get(h.account_id as string) ?? '',
    }))
    .filter(h => h.titular !== '')

  return (
    <CuentasClient
      rows={rows}
      totalByTitular={totalByTitular}
      totalTodo={totalTodo}
      stockOptions={stockOptions}
      holdings={holdings}
    />
  )
}
