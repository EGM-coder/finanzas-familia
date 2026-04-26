import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CuentasClient from './CuentasClient'
import type {
  Account, AccountWithBalance, Liability,
  GrupoSection, CuentasPageData, SectionId, PatrimonioNetoRow,
} from '@/types/cuentas'

function classifyAccount(name: string): SectionId {
  const n = name.toLowerCase()
  // Orden importa: cripto y cartera antes de "trade republic" genérico
  if (n.includes('cripto'))                                                         return 'cripto'
  if (n.includes('cartera') || n.includes('degiro') || n.includes('bbva valores')) return 'renta_variable'
  if (n.includes('myinvestor'))                                                     return 'fondos'
  if (n.includes('trade republic'))                                                 return 'liquidez'
  return 'corriente'
}

const SECTION_META: Record<SectionId, { roman: string; label: string }> = {
  corriente:      { roman: 'I',   label: 'Corriente' },
  liquidez:       { roman: 'II',  label: 'Liquidez remunerada' },
  renta_variable: { roman: 'III', label: 'Renta variable' },
  cripto:         { roman: 'IV',  label: 'Cripto' },
  fondos:         { roman: 'V',   label: 'Fondos largo plazo' },
  deudas:         { roman: 'VI',  label: 'Deudas' },
}

const SECTION_ORDER: SectionId[] = [
  'corriente', 'liquidez', 'renta_variable', 'cripto', 'fondos', 'deudas',
]

export default async function CuentasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: accountsRaw },
    { data: liabilitiesRaw },
    { data: profileData },
    { data: patrimonioRaw },
  ] = await Promise.all([
    supabase.from('account_balances_full').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('liabilities').select('*').eq('is_active', true),
    supabase.from('profiles').select('role').eq('user_id', user.id).single(),
    supabase.from('patrimonio_neto').select('*').single(),
  ])

  const userRole = (profileData?.role ?? 'eric') as 'eric' | 'ana'

  const accounts: AccountWithBalance[] = (accountsRaw ?? []).map(a => ({
    ...(a as Account),
    current_balance: Number(a.current_balance),
    transactions_sum: Number(a.transactions_sum),
    holdings_value_eur: Number(a.holdings_value_eur),
    cards: [],
  }))

  // Anidar tarjetas bajo su cuenta padre
  const accountMap = new Map<string, AccountWithBalance>()
  const mainAccounts = accounts.filter(a => a.type !== 'card')
  mainAccounts.forEach(a => accountMap.set(a.id, a))
  accounts.filter(a => a.type === 'card').forEach(card => {
    if (card.linked_account_id) {
      accountMap.get(card.linked_account_id)?.cards.push(card)
    }
  })

  // Clasificar cuentas en secciones
  const sectionMap = new Map<SectionId, AccountWithBalance[]>()
  mainAccounts.forEach(acc => {
    const sid = classifyAccount(acc.name)
    if (!sectionMap.has(sid)) sectionMap.set(sid, [])
    sectionMap.get(sid)!.push(acc)
  })

  const liabilities = (liabilitiesRaw ?? []) as Liability[]

  // Construir secciones con subtotales para display
  const secciones: GrupoSection[] = SECTION_ORDER.map(sid => {
    const accs  = sectionMap.get(sid) ?? []
    const libs  = sid === 'deudas' ? liabilities : []
    const total = sid === 'deudas'
      ? -libs.reduce((s, l) => s + Number(l.current_balance), 0)
      : accs.reduce((s, a) =>
          s + a.current_balance + a.cards.reduce((cs, c) => cs + c.current_balance, 0), 0)
    return { id: sid, ...SECTION_META[sid], accounts: accs, liabilities: libs, total }
  })

  const patrimonioDetalle: PatrimonioNetoRow = patrimonioRaw
    ? {
        liquidos_y_holdings:           Number(patrimonioRaw.liquidos_y_holdings),
        inmuebles:                     Number(patrimonioRaw.inmuebles),
        activos_total:                 Number(patrimonioRaw.activos_total),
        deudas_activas:                Number(patrimonioRaw.deudas_activas),
        deudas_proyectadas:            Number(patrimonioRaw.deudas_proyectadas),
        patrimonio_neto_actual:        Number(patrimonioRaw.patrimonio_neto_actual),
        patrimonio_neto_si_firmara_hoy: Number(patrimonioRaw.patrimonio_neto_si_firmara_hoy),
      }
    : {
        liquidos_y_holdings: 0, inmuebles: 0, activos_total: 0,
        deudas_activas: 0, deudas_proyectadas: 0,
        patrimonio_neto_actual: 0, patrimonio_neto_si_firmara_hoy: 0,
      }

  return <CuentasClient data={{ secciones, patrimonioDetalle, userRole }} />
}
