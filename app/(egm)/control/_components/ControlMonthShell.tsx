'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ControlMonthLedger, type EnrichedRow } from './ControlMonthLedger'
import { CategorizationDrawer, type DirtySnapshot } from './CategorizationDrawer'
import { AggregatesPanel, type ServerAggregates } from './AggregatesPanel'
import { ReviewToggleBar } from './ReviewToggleBar'
import { type Category } from './CategoryCombobox'
import { type Project } from './ProjectCombobox'

interface Props {
  rows: EnrichedRow[]
  categories: Category[]
  initialProjects: Project[]
  serverAggregates: ServerAggregates
  countPorRevisar: number
  initialModo: 'todas' | 'pendientes'
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
  initialModo,
  userId,
  mes,
  isCurrentMonth,
}: Props) {
  const router = useRouter()
  const [modo, setModo] = useState<'todas' | 'pendientes'>(initialModo)
  const [selectedTx, setSelectedTx] = useState<EnrichedRow | null>(null)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [pendingDirtySnapshot, setPendingDirtySnapshot] = useState<DirtySnapshot | null>(null)

  // Reset removedIds when data refreshes (router.refresh after categorization save)
  useEffect(() => {
    setRemovedIds(new Set())
  }, [rows])

  // Close drawer cleanly when navigating to a different month
  useEffect(() => {
    setSelectedTx(null)
  }, [mes])

  function handleModoChange(nuevoModo: 'todas' | 'pendientes') {
    setModo(nuevoModo)
    router.replace(`/control?mes=${mes}&ver=${nuevoModo}`, { scroll: false })
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
    modo === 'pendientes' ? rows.filter((r) => r.por_revisar) : rows

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
