export const fmtDate = (d: string | Date): string => {
  const dt = typeof d === 'string' ? new Date(d) : d
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const day = dt.getDate().toString().padStart(2, '0')
  return `${day}·${months[dt.getMonth()]}·${dt.getFullYear().toString().slice(-2)}`
}

export const fmtAmount = (n: number, currency = 'EUR'): string =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(n)
