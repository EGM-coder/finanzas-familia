'use client'
import { useState } from 'react'
import { ControlTable, type Row } from './ControlTable'
import { CategorizationDrawer } from './CategorizationDrawer'
import { type Category } from './CategoryCombobox'

interface Props {
  rows: Row[]
  categories: Category[]
}

export function ControlClientShell({ rows, categories }: Props) {
  const [selectedTx, setSelectedTx] = useState<Row | null>(null)

  return (
    <>
      <ControlTable rows={rows} onRowClick={setSelectedTx} />
      <CategorizationDrawer
        transaction={selectedTx}
        categories={categories}
        onClose={() => setSelectedTx(null)}
      />
    </>
  )
}
