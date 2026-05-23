import { fmtAmount } from '../../_lib/formatters'

interface Props {
  label: string
  value: number
  baseline: number | null
}

export function PlannerBarCompare({ label, value, baseline }: Props) {
  const max = Math.max(value, baseline ?? 0, 1)
  const valuePct = (value / max) * 100
  const baselinePct = baseline != null ? (baseline / max) * 100 : null
  const isAbove = baseline != null && value > baseline * 1.05

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="label" style={{ fontSize: 9, color: 'var(--ink-4)' }}>{label}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span
            className="num"
            style={{ fontSize: 13, color: isAbove ? 'var(--signal-neg)' : 'var(--ink)' }}
          >
            {fmtAmount(value)}
          </span>
          {baseline != null && (
            <span className="roman" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
              vs {fmtAmount(baseline)}
            </span>
          )}
        </div>
      </div>
      <div style={{ position: 'relative', height: 6, background: 'var(--rule)', borderRadius: 2 }}>
        <div
          style={{
            position: 'absolute', top: 0, left: 0, height: '100%',
            width: `${valuePct}%`,
            background: isAbove ? 'var(--signal-neg)' : 'var(--ink-3)',
            borderRadius: 2,
          }}
        />
        {baselinePct != null && (
          <div
            style={{
              position: 'absolute', top: -4, bottom: -4,
              left: `${baselinePct}%`,
              width: 2, background: 'var(--ink-2)',
              transform: 'translateX(-50%)',
            }}
          />
        )}
      </div>
    </div>
  )
}
