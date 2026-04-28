import type { SnapshotDeltaRow } from '@/types/cuentas'

// Helpers de presentación para el delta de snapshot.
// Los datos llegan del servidor via props (page.tsx → CuentasClient).
// Este módulo centraliza la lógica de formateo para DeltaIndicator y SnapshotHealthBanner.

export function formatDelta(
  delta: number | null,
  pct: number | null,
  visible: boolean
): { label: string; positive: boolean | null } {
  if (delta === null || !visible) return { label: visible ? '—' : '•••', positive: null }

  const sign = delta >= 0 ? '+' : ''
  const absStr = new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Math.abs(delta))

  const pctStr = pct != null
    ? ` (${sign}${pct.toFixed(2).replace('.', ',')}%)`
    : ''

  return {
    label: `${sign}${absStr}${pctStr} 30d`,
    positive: delta >= 0,
  }
}

export function snapshotIsStale(snapshot: SnapshotDeltaRow | null): boolean {
  if (!snapshot) return true
  return snapshot.minutes_since_capture > 1500  // >25h = no capturó hoy
}
