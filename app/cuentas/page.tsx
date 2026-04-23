import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CuentasClient from './CuentasClient'
import type {
  Account, AccountWithBalance, Liability,
  GrupoSection, CuentasPageData, SectionId,
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
    { data: balancesRaw },
    { data: liabilitiesRaw },
    { data: profileData },
  ] = await Promise.all([
    supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('account_balances').select('*'),
    supabase.from('liabilities').select('*').eq('is_active', true),
    supabase.from('profiles').select('role').eq('user_id', user.id).single(),
  ])

  const userRole = (profileData?.role ?? 'eric') as 'eric' | 'ana'

  // Merge saldos en array plano — cada fila de BD contada una sola vez
  const balanceMap = new Map(
    (balancesRaw ?? []).map(b => [b.account_id, Number(b.current_balance)])
  )
  const accounts: AccountWithBalance[] = (accountsRaw ?? []).map(a => ({
    ...(a as Account),
    current_balance: balanceMap.get(a.id) ?? Number(a.initial_balance),
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

  // Patrimonio neto = suma del array plano (sin jerarquía) − pasivos
  const totalActivos = accounts.reduce((s, a) => s + a.current_balance, 0)
  const totalPasivos = liabilities.reduce((s, l) => s + Number(l.current_balance), 0)
  const patrimonioNeto = totalActivos - totalPasivos

  return <CuentasClient data={{ secciones, patrimonioNeto, userRole }} />
}
