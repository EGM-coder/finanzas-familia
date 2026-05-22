import { fmtAmount } from '../../_lib/formatters'

type Tone = 'positive' | 'negative' | 'neutral'

interface Props {
  label: string
  value: number | null
  tone?: Tone
  sublabel?: string
}

const TONE_COLOR: Record<Tone, string> = {
  positive: 'var(--signal-pos)',
  negative: 'var(--signal-neg)',
  neutral:  'var(--ink)',
}

export function PlannerCard({ label, value, tone = 'neutral', sublabel }: Props) {
  return (
    <div
      className="card"
      style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div
        className="label"
        style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--ink-4)' }}
      >
        {label}
      </div>

      <div
        className="num"
        style={{ fontSize: 30, fontWeight: 600, color: TONE_COLOR[tone], lineHeight: 1 }}
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
