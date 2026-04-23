export type AccountType   = 'bank' | 'investment' | 'broker' | 'cash' | 'pension' | 'card'
export type Visibility    = 'privada_eric' | 'privada_ana' | 'compartida'
export type LiabilityType = 'hipoteca' | 'prestamo_personal' | 'financiacion_consumo' | 'linea_credito' | 'otros'
export type SectionId     = 'corriente' | 'liquidez' | 'renta_variable' | 'cripto' | 'fondos' | 'deudas'

export interface Account {
  id: string
  name: string
  institution: string
  type: AccountType
  visibility: Visibility
  currency: string
  is_active: boolean
  notes: string | null
  sort_order: number
  initial_balance: number
  linked_account_id: string | null
}

export interface AccountWithBalance extends Account {
  current_balance: number
  cards: AccountWithBalance[]
}

export interface Liability {
  id: string
  name: string
  type: LiabilityType
  lender: string | null
  visibility: Visibility
  original_principal: number
  current_balance: number
  interest_rate: number | null
  interest_type: 'fijo' | 'variable' | 'mixto' | null
  monthly_payment: number | null
  status: 'activa' | 'proyectada' | 'cerrada'
  is_active: boolean
}

export interface GrupoSection {
  id: SectionId
  roman: string
  label: string
  accounts: AccountWithBalance[]
  liabilities: Liability[]
  total: number
}

export interface CuentasPageData {
  secciones: GrupoSection[]
  patrimonioNeto: number
  userRole: 'eric' | 'ana'
}
