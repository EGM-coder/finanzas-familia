'use client'
import { useState } from 'react'
import { ControlTable, type Row } from './ControlTable'
import { CategorizationDrawer } from './CategorizationDrawer'

interface Props {
  rows: Row[]
}

export function ControlClientShell({ rows }: Props) {
  const [selectedTx, setSelectedTx] = useState<Row | null>(null)

  return (
    <>
      <ControlTable rows={rows} onRowClick={setSelectedTx} />
      <CategorizationDrawer
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
      />
    </>
  )
}
