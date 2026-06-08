import type { IncomeCandidate } from '../_actions/nominas'
export type { IncomeCandidate }

export type IncomeRow = {
  id: string
  type: string
  net_amount: number
  concept: string
}

export type LinkedTxn = {
  id: string
  date: string
  amount: number
  description: string | null
}

export type MonthStatus = 'sin_contraparte' | 'cuadrado' | 'parcial' | 'pendiente'

export type MonthEntry = {
  mes: string           // 'YYYY-MM'
  incomes_net: number
  linked_dep: number
  n_incomes: number
  n_linked: number
  status: MonthStatus
  incomeRows: IncomeRow[]
  linkedTxns: LinkedTxn[]   // distinct transactions ya enlazadas
  candidates: IncomeCandidate[]
}
