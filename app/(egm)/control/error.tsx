'use client'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ControlError({ error, reset }: Props) {
  return (
    <div className="max-w-6xl mx-auto px-8 py-12">
      <div className="label" style={{ marginBottom: 12 }}>III · CONTROL</div>
      <div className="display-it" style={{ fontSize: 32, marginBottom: 12 }}>Algo no encajó.</div>
      <p className="roman" style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 28 }}>
        {error.message}
      </p>
      <button
        onClick={reset}
        className="btn btn-ghost"
        style={{ fontSize: 11 }}
      >
        Reintentar
      </button>
    </div>
  )
}
