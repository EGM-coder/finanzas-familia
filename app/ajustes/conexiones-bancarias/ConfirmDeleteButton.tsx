'use client'
import { useState, useTransition } from 'react'

interface Props {
  connectionId: string
  aspspName: string
  action: (formData: FormData) => Promise<void>
}

export function ConfirmDeleteButton({ connectionId, aspspName, action }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="btn btn-ghost"
        style={{ fontSize: 11, padding: '6px 12px' }}
      >
        Eliminar
      </button>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <span className="roman" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        ¿Eliminar {aspspName}? Transacciones se conservan.
      </span>
      <form
        action={(formData) => startTransition(() => action(formData))}
        style={{ display: 'inline' }}
      >
        <input type="hidden" name="connection_id" value={connectionId} />
        <button
          type="submit"
          disabled={pending}
          className="btn"
          style={{ fontSize: 11, padding: '6px 12px', color: 'var(--signal-neg)', borderColor: 'var(--signal-neg)' }}
        >
          {pending ? 'Eliminando…' : 'Sí, eliminar'}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="btn btn-ghost"
        style={{ fontSize: 11, padding: '6px 12px' }}
      >
        Cancelar
      </button>
    </span>
  )
}
