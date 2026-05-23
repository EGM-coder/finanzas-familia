interface Segment {
  label: string
  value: number
  color: string
}

interface Props {
  segments: Segment[]
  size?: number
  strokeWidth?: number
}

export function PlannerDonut({ segments, size = 110, strokeWidth = 20 }: Props) {
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return null

  let cumulative = 0

  return (
    <svg
      width={size}
      height={size}
      style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}
      aria-hidden="true"
    >
      {segments.map((seg, i) => {
        const fraction = seg.value / total
        const dashLen = fraction * circ
        const offset = cumulative * circ
        cumulative += fraction
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dashLen} ${circ - dashLen}`}
            strokeDashoffset={-offset}
          />
        )
      })}
    </svg>
  )
}
