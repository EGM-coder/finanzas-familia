'use client'
import { useState, useEffect } from 'react'
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
      />
    </>
  )
}
