'use client'
import { useState } from 'react'
import { fmtAmount } from '../../_lib/formatters'

type Tone = 'positive' | 'negative' | 'neutral'

interface Props {
  label: string
  value: number | null
  tone?: Tone
  sublabel?: string
  onClick?: () => void
}

const TONE_COLOR: Record<Tone, string> = {
  positive: 'var(--signal-pos)',
  negative: 'var(--signal-neg)',
  neutral:  'var(--ink)',
}

export function PlannerCard({ label, value, tone = 'neutral', sublabel, onClick }: Props) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="card"
      style={{
        padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 10,
        cursor: onClick ? 'pointer' : undefined,
      }}
      onClick={onClick}
      onMouseEnter={onClick ? () => setHovered(true) : undefined}
      onMouseLeave={onClick ? () => setHovered(false) : undefined}
    >
      <div
        className="label"
        style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--ink-4)' }}
      >
        {label}
      </div>

      <div
        className="num"
        style={{
          fontSize: 30, fontWeight: 600, color: TONE_COLOR[tone], lineHeight: 1,
          textDecoration: onClick && hovered ? 'underline' : undefined,
          textDecorationThickness: '1px',
          textDecorationColor: TONE_COLOR[tone],
          textUnderlineOffset: '5px',
        }}
      >
        {value !== null ? fmtAmount(value) : '——'}
      </div>

      {sublabel && (
        <div
          className="roman"
          style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}
        >
          {sublabel}
        </div>
      )}
    </div>
  )
}
