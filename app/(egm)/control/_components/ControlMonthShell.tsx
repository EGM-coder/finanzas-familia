'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ControlMonthLedger } from './ControlMonthLedger'
import { CategorizationDrawer, type DirtySnapshot } from './CategorizationDrawer'
import { type Row } from './ControlTable'
import { type Category } from './CategoryCombobox'
import { type Project } from './ProjectCombobox'

interface Props {
  rows: Row[]
  categories: Category[]
  initialProjects: Project[]
}

export function ControlMonthShell({ rows, categories, initialProjects }: Props) {
  const router = useRouter()
  const [selectedTx, setSelectedTx] = useState<Row | null>(null)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [pendingDirtySnapshot, setPendingDirtySnapshot] = useState<DirtySnapshot | null>(null)

  useEffect(() => {
    setRemovedIds(new Set())
  }, [rows])

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

  return (
    <>
      <ControlMonthLedger
        rows={rows}
        categories={categories}
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
