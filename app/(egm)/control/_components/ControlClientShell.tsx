'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ControlTable, type Row } from './ControlTable'
import { CategorizationDrawer } from './CategorizationDrawer'
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

  const markRemoved = (id: string) =>
    setRemovedIds(prev => new Set(prev).add(id))

  const restoreRow = (id: string) =>
    setRemovedIds(prev => { const n = new Set(prev); n.delete(id); return n })

  const refreshAfterFade = () => setTimeout(() => router.refresh(), 350)

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
        onRefreshAfterFade={refreshAfterFade}
      />
    </>
  )
}
