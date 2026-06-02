import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PedidosShell } from './_components/PedidosShell'
import type { Category } from '@/app/(egm)/control/_components/CategoryCombobox'
import type { Pedido } from './_components/types'

export default async function PedidosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [ordersRes, catsRes] = await Promise.all([
    supabase
      .from('purchase_orders')
      .select(`
        id, source, source_order_id, merchant, order_date, total_amount, currency,
        is_financed, installment_count, installment_amount, first_charge_date, match_status,
        purchase_order_lines(
          id, description, quantity, total_amount,
          category_id, ai_suggested_category_id, category_confirmed
        ),
        purchase_order_charges(
          id, match_method, transaction_id, installment_number,
          transactions(id, amount, date, counterparty, category_id)
        )
      `)
      .order('order_date', { ascending: false }),
    supabase
      .from('categories')
      .select('id, name, parent_id, color, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ])

  if (ordersRes.error) throw new Error(ordersRes.error.message)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '34px 32px 80px' }}>
      <div className="label" style={{ marginBottom: 4, color: 'var(--ink-3)' }}>
        V · Pedidos
      </div>
      <div className="display" style={{ fontSize: 28, marginTop: 4, marginBottom: 32 }}>
        Pedidos
      </div>
      <PedidosShell
        orders={(ordersRes.data ?? []) as unknown as Pedido[]}
        categories={(catsRes.data ?? []) as Category[]}
      />
    </div>
  )
}
