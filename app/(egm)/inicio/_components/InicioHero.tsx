'use client'
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(
    Math.abs(Math.round(n)),
  )
}

function useCountUp(target: number, durationSec: number): number {
  const [val, setVal] = useState(0)
  const frameRef = useRef<number>(0)
  const startRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    startRef.current = undefined
    const durationMs = durationSec * 1000
    const step = (t: number) => {
      if (startRef.current === undefined) startRef.current = t
      const elapsed = t - startRef.current
      const p = Math.min(elapsed / durationMs, 1)
      const eased = 1 - (1 - p) ** 3
      setVal(target * eased)
      if (p < 1) frameRef.current = requestAnimationFrame(step)
    }
    frameRef.current = requestAnimationFrame(step)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
  }, [target, durationSec])

  return val
}

interface Props {
  liquidos: number
}

export function InicioHero({ liquidos }: Props) {
  const shouldReduce = useReducedMotion() ?? false
  const display = useCountUp(liquidos, shouldReduce ? 0.15 : 0.6)

  return (
    <div
      className={shouldReduce ? 'display num' : 'display num breathe'}
      style={{ fontSize: 96, letterSpacing: '-0.025em', lineHeight: 1 }}
      suppressHydrationWarning
    >
      {fmt(display)}<span style={{ fontSize: 36, color: 'var(--ink-3)' }}> €</span>
    </div>
  )
}
