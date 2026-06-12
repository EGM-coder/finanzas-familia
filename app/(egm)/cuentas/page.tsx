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
  id:                string
  account_id:        string
  ticker:            string | null
  isin:              string | null
  name:              string
  asset_type:        string
  original_currency: string
  quantity:          number
  current_price_eur: number | null
  current_value_eur: number | null
  titular:           string
}

export type DetalleRow = {
  account_id:  string
  name:        string
  institution: string
  visibility:  string
  titular:     string
  segmento:    string
  orden:       number
  valor:       number
}

export type ManualHoldingRow = {
  id:                string
  account_id:        string
  name:              string
  asset_type:        string
  current_value_eur: number
  last_update_date:  string
}

export type PricePoint = { date: string; close_eur: number }

export default async function CuentasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [composicionRes, stockOptRes, holdingsRes, accountsRes, detalleRes, pricesRes, manualRes] =
    await Promise.all([
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
        .select('id, account_id, ticker, isin, name, asset_type, original_currency, quantity, current_price_eur, current_value_eur, is_active')
        .eq('is_active', true),
      supabase
        .from('accounts')
        .select('id, titular')
        .eq('is_active', true),
      supabase
        .from('v_cuentas_detalle')
        .select('account_id, name, institution, visibility, titular, segmento, orden, valor')
        .order('titular')
        .order('segmento'),
      supabase
        .from('holding_prices')
        .select('ticker, isin, date, close_eur')
        .gte('date', ninetyDaysAgo)
        .not('close_eur', 'is', null)
        .order('date'),
      supabase
        .from('manual_holdings')
        .select('id, account_id, name, asset_type, current_value_eur, last_update_date')
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

  const accountTitular = new Map<string, string>(
    (accountsRes.data ?? []).map(a => [a.id as string, a.titular as string])
  )
  const holdings: HoldingRow[] = (holdingsRes.data ?? [])
    .map(h => ({
      id:                h.id as string,
      account_id:        h.account_id as string,
      ticker:            h.ticker as string | null,
      isin:              h.isin as string | null,
      name:              h.name as string,
      asset_type:        h.asset_type as string,
      original_currency: h.original_currency as string,
      quantity:          Number(h.quantity),
      current_price_eur: h.current_price_eur != null ? Number(h.current_price_eur) : null,
      current_value_eur: h.current_value_eur != null ? Number(h.current_value_eur) : null,
      titular:           accountTitular.get(h.account_id as string) ?? '',
    }))
    .filter(h => h.titular !== '')

  const detalleRows: DetalleRow[] = (detalleRes.data ?? []).map(r => ({
    account_id:  r.account_id as string,
    name:        r.name        as string,
    institution: r.institution as string,
    visibility:  r.visibility  as string,
    titular:     r.titular     as string,
    segmento:    r.segmento    as string,
    orden:       Number(r.orden),
    valor:       Number(r.valor),
  }))

  const pricesByTicker: Record<string, PricePoint[]> = {}
  const pricesByIsin:   Record<string, PricePoint[]> = {}
  for (const p of (pricesRes.data ?? [])) {
    const pt: PricePoint = { date: p.date as string, close_eur: Number(p.close_eur) }
    const tk = p.ticker as string | null
    const is = p.isin   as string | null
    if (tk) {
      if (!pricesByTicker[tk]) pricesByTicker[tk] = []
      pricesByTicker[tk].push(pt)
    } else if (is) {
      if (!pricesByIsin[is]) pricesByIsin[is] = []
      pricesByIsin[is].push(pt)
    }
  }

  const manualHoldings: ManualHoldingRow[] = (manualRes.data ?? []).map(m => ({
    id:                m.id                as string,
    account_id:        m.account_id        as string,
    name:              m.name              as string,
    asset_type:        m.asset_type        as string,
    current_value_eur: Number(m.current_value_eur),
    last_update_date:  m.last_update_date  as string,
  }))

  return (
    <CuentasClient
      rows={rows}
      totalByTitular={totalByTitular}
      totalTodo={totalTodo}
      stockOptions={stockOptions}
      holdings={holdings}
      detalleRows={detalleRows}
      pricesByTicker={pricesByTicker}
      pricesByIsin={pricesByIsin}
      manualHoldings={manualHoldings}
    />
  )
}
