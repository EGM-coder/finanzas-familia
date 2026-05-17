'use client'
import { useState } from 'react'
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
  const [selectedTx, setSelectedTx] = useState<Row | null>(null)

  return (
    <>
      <ControlTable rows={rows} onRowClick={setSelectedTx} />
      <CategorizationDrawer
        transaction={selectedTx}
        categories={categories}
        projects={initialProjects}
        onClose={() => setSelectedTx(null)}
      />
    </>
  )
}
