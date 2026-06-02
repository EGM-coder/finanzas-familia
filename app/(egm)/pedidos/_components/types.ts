export type PedidoLine = {
  id: string
  description: string
  quantity: number
  total_amount: number
  category_id: string | null
  ai_suggested_category_id: string | null
  category_confirmed: boolean
}

export type PedidoChargeTxn = {
  id: string
  amount: number
  date: string
  counterparty: string | null
  category_id: string | null
}

export type PedidoCharge = {
  id: string
  match_method: 'manual' | 'ai_proposed' | 'confirmed'
  transaction_id: string
  installment_number: number | null
  transactions: PedidoChargeTxn | null
}

export type Pedido = {
  id: string
  source: string
  source_order_id: string | null
  merchant: string | null
  order_date: string
  total_amount: number
  currency: string
  is_financed: boolean
  installment_count: number | null
  installment_amount: number | null
  first_charge_date: string | null
  match_status: 'sin_linkar' | 'parcial' | 'completo'
  purchase_order_lines: PedidoLine[]
  purchase_order_charges: PedidoCharge[]
}
