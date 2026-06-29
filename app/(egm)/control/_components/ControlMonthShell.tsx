'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ControlMonthLedger, type EnrichedRow } from './ControlMonthLedger'
import { CategorizationDrawer, type DirtySnapshot } from './CategorizationDrawer'
import { AggregatesPanel, type ServerAggregates } from './AggregatesPanel'
import { ReviewToggleBar, type FilterModo } from './ReviewToggleBar'
import { type Category } from './CategoryCombobox'
import { type Project } from './ProjectCombobox'

interface Props {
  rows: EnrichedRow[]
  categories: Category[]
  initialProjects: Project[]
  serverAggregates: ServerAggregates
  countPorRevisar: number
  countSinClasificar: number
  initialModo: FilterModo
  userId: string
  mes: string
  isCurrentMonth: boolean
}

export function ControlMonthShell({
  rows,
  categories,
  initialProjects,
  serverAggregates,
  countPorRevisar,
  countSinClasificar,
  initialModo,
  userId,
  mes,
  isCurrentMonth,
}: Props) {
  const router = useRouter()
  const [modo, setModo] = useState<FilterModo>(initialModo)
  const [selectedTx, setSelectedTx] = useState<EnrichedRow | null>(null)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [pendingDirtySnapshot, setPendingDirtySnapshot] = useState<DirtySnapshot | null>(null)

  useEffect(() => {
    setRemovedIds(new Set())
  }, [rows])

  useEffect(() => {
    setSelectedTx(null)
  }, [mes])

  function handleModoChange(nuevoModo: FilterModo) {
    setModo(nuevoModo)
    // Preservar view=apuntes para que el deep-link funcione en hard refresh
    router.replace(`/control?mes=${mes}&view=apuntes&ver=${nuevoModo}`, { scroll: false })
  }

  const markRemoved = (id: string) => {
    setRemovedIds((prev) => new Set(prev).add(id))
    setTimeout(() => router.refresh(), 350)
  }

  const handleReopenWithDirty = (txnId: string, snapshot: DirtySnapshot) => {
    const txn = rows.find((t) => t.id === txnId)
    if (!txn) return
    setPendingDirtySnapshot(snapshot)
    setSelectedTx(txn)
  }

  const rowsVisibles =
    modo === 'pendientes'
      ? rows.filter((r) => r.por_revisar)
      : modo === 'sin_clasificar'
        ? rows.filter((r) => r.category_id === null && r.amount < 0 && r.superseded_by === null)
        : rows

  return (
    <>
      <AggregatesPanel
        serverAggregates={serverAggregates}
        userId={userId}
        mes={mes}
      />

      <div style={{ borderTop: '1px solid var(--rule)', margin: '0 0 24px' }} />

      <ReviewToggleBar
        count={countPorRevisar}
        countSinClasificar={countSinClasificar}
        modo={modo}
        onChange={handleModoChange}
      />

      <ControlMonthLedger
        rows={rowsVisibles}
        mes={mes}
        isCurrentMonth={isCurrentMonth}
        onRowClick={setSelectedTx}
        removedIds={removedIds}
      />

      <CategorizationDrawer
        transaction={selectedTx}
        categories={categories}
        projects={initialProjects}
        onClose={() => setSelectedTx(null)}
        onMarkRemoved={markRemoved}
        onRestoreRow={() => router.refresh()}
        initialDirtySnapshot={pendingDirtySnapshot}
        onConsumeDirtySnapshot={() => setPendingDirtySnapshot(null)}
        onReopenWithDirty={handleReopenWithDirty}
      />
    </>
  )
}
