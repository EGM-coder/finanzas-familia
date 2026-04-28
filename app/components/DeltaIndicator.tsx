'use client'

import { formatDelta } from '@/app/hooks/useSnapshotDelta'

interface Props {
  delta: number | null
  pct: number | null
  visible: boolean
}

export default function DeltaIndicator({ delta, pct, visible }: Props) {
  const { label, positive } = formatDelta(delta, pct, visible)

  const color =
    positive === null  ? '#5A5449' :
    positive           ? '#3A5232' :
                         '#A05C3E'

  return (
    <span style={{
      fontSize: 11,
      color,
      fontFeatureSettings: "'tnum'",
      letterSpacing: '0.01em',
    }}>
      {positive === true  && '▲ '}
      {positive === false && '▼ '}
      {label}
    </span>
  )
}
