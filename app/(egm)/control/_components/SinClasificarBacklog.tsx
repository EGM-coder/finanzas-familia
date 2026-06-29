'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ControlMonthLedger, type EnrichedRow } from './ControlMonthLedger'
import { CategorizationDrawer, type DirtySnapshot } from './CategorizationDrawer'
import { type Category } from './CategoryCombobox'
import { type Project } from './ProjectCombobox'

interface Props {
  rows: EnrichedRow[]
  categories: Category[]
  projects: Project[]
  mes: string
}

export function SinClasificarBacklog({ rows, categories, projects, mes }: Props) {
  const router = useRouter()
  const [selectedTx, setSelectedTx] = useState<EnrichedRow | null>(null)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [pendingDirtySnapshot, setPendingDirtySnapshot] = useState<DirtySnapshot | null>(null)

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

  if (rows.length === 0) {
    return (
      <div style={{ padding: '64px 0', textAlign: 'center' }}>
        <div className="display-it" style={{ fontSize: 22 }}>Sin clasificar al día.</div>
      </div>
    )
  }

  return (
    <>
      <ControlMonthLedger
        rows={rows}
        mes={mes}
        isCurrentMonth={false}
        onRowClick={setSelectedTx}
        removedIds={removedIds}
      />

      <CategorizationDrawer
        transaction={selectedTx}
        categories={categories}
        projects={projects}
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
