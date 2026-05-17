'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ControlTable, type Row } from './ControlTable'
import { CategorizationDrawer, type DirtySnapshot } from './CategorizationDrawer'
import { type Category } from './CategoryCombobox'
import { type Project } from './ProjectCombobox'

interface Props {
  rows: Row[]
  categories: Category[]
  initialProjects: Project[]
}

export function ControlClientShell({ rows, categories, initialProjects }: Props) {
  const router = useRouter()
  const [selectedTx, setSelectedTx] = useState<Row | null>(null)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [pendingDirtySnapshot, setPendingDirtySnapshot] = useState<DirtySnapshot | null>(null)

  useEffect(() => {
    setRemovedIds(new Set())
  }, [rows])

  const markRemoved = (id: string) => {
    setRemovedIds(prev => new Set(prev).add(id))
    setTimeout(() => router.refresh(), 350)
  }

  const restoreRow = () => {
    router.refresh()
  }

  const handleReopenWithDirty = (txnId: string, snapshot: DirtySnapshot) => {
    const txn = rows.find(t => t.id === txnId)
    if (!txn) return
    setPendingDirtySnapshot(snapshot)
    setSelectedTx(txn)
  }

  const handleConsumeDirtySnapshot = () => {
    setPendingDirtySnapshot(null)
  }

  return (
    <>
      <ControlTable rows={rows} onRowClick={setSelectedTx} removedIds={removedIds} />
      <CategorizationDrawer
        transaction={selectedTx}
        categories={categories}
        projects={initialProjects}
        onClose={() => setSelectedTx(null)}
        onMarkRemoved={markRemoved}
        onRestoreRow={restoreRow}
        initialDirtySnapshot={pendingDirtySnapshot}
        onConsumeDirtySnapshot={handleConsumeDirtySnapshot}
        onReopenWithDirty={handleReopenWithDirty}
      />
    </>
  )
}
