import { ControlHeader } from './_components/ControlHeader'

export default function ControlLoading() {
  return (
    <div className="max-w-6xl mx-auto px-8 py-12">
      <ControlHeader />

      {/* Toggle skeleton */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
        {[80, 60].map((w, i) => (
          <div key={i} style={{ width: w, height: 16, background: 'var(--rule-2)', borderRadius: 2 }} />
        ))}
      </div>

      {/* Table header skeleton */}
      <div style={{ height: 1, background: 'var(--ink)', marginBottom: 1 }} />

      {/* Row skeletons */}
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 40,
            background: 'var(--rule-2)',
            marginBottom: 1,
            opacity: 1 - i * 0.07,
            animation: 'egm-breathe 2s ease-in-out infinite',
            animationDelay: `${i * 0.06}s`,
          }}
        />
      ))}
    </div>
  )
}
