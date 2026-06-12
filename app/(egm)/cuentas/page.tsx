import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CuentasClient } from './_components/CuentasClient'

export type ComposicionRow = {
  titular: string
  segmento: string
  orden: number
  valor: number
}

export default async function CuentasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows, error } = await supabase
    .from('v_cuentas_composicion')
    .select('titular, segmento, orden, valor')
    .order('titular')
    .order('orden')

  if (error) throw error

  const data: ComposicionRow[] = (rows ?? []).map(r => ({
    titular:  r.titular  as string,
    segmento: r.segmento as string,
    orden:    Number(r.orden),
    valor:    Number(r.valor),
  }))

  const totalByTitular: Record<string, number> = {}
  for (const r of data) {
    totalByTitular[r.titular] = (totalByTitular[r.titular] ?? 0) + r.valor
  }
  const totalTodo = Object.values(totalByTitular).reduce((s, v) => s + v, 0)

  return (
    <CuentasClient
      rows={data}
      totalByTitular={totalByTitular}
      totalTodo={totalTodo}
    />
  )
}
