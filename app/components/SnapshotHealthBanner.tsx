'use client'

import { snapshotIsStale } from '@/app/hooks/useSnapshotDelta'
import type { SnapshotDeltaRow } from '@/types/cuentas'

interface Props {
  snapshot: SnapshotDeltaRow | null
}

export default function SnapshotHealthBanner({ snapshot }: Props) {
  if (!snapshotIsStale(snapshot)) return null

  return (
    <div style={{
      margin: '12px 16px 0',
      padding: '8px 12px',
      borderRadius: 8,
      background: '#FDF3E3',
      border: '1px solid #E8D5A3',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ fontSize: 13 }}>⚠</span>
      <span style={{ fontSize: 11, color: '#7A5A1A' }}>
        Precios no actualizados hoy — los deltas pueden no ser precisos
      </span>
    </div>
  )
}
