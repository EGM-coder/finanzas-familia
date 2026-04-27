'use client'

import { useState } from 'react'
import type { CuentasPageData, GrupoSection, AccountWithBalance, Liability } from '@/types/cuentas'
import PatrimonioNetoCard from './PatrimonioNetoCard'
import StockOptionsCard from './StockOptionsCard'

// ── Paleta ────────────────────────────────────────────────────
const C = {
  bg:       '#F7F4ED',
  text:     '#2A2822',
  secondary:'#5A5449',
  border:   '#DDD7C7',
  accent:   '#4C5844',
  negative: '#A05C3E',
  surface:  '#FFFFFF',
  subrow:   '#FAFAF8',
}

const SECTION_COLOR: Record<string, string> = {
  corriente:      '#8B7355',
  liquidez:       '#6B8C5E',
  renta_variable: '#7A6B55',
  cripto:         '#5B6B7A',
  fondos:         '#4C5844',
  deudas:         '#A05C3E',
}

const USER_LABEL: Record<'eric' | 'ana', string> = {
  eric: 'ERIC GAHIMBARE',
  ana:  'ANA',
}

// ── Formateo ──────────────────────────────────────────────────
function fmt(n: number, visible: boolean): string {
  if (!visible) return '•••'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

// ── Iconos SVG ────────────────────────────────────────────────
function EyeIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx={12} cy={12} r={3}/>
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1={1} y1={1} x2={23} y2={23}/>
    </svg>
  )
}

// ── Fila cuenta ───────────────────────────────────────────────
function FilaAccount({ acc, visible }: { acc: AccountWithBalance; visible: boolean }) {
  return (
    <>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '9px 14px',
        borderTop: `1px solid ${C.border}`,
      }}>
        <div>
          <div style={{ fontSize: 13, color: C.text }}>{acc.name}</div>
          <div style={{ fontSize: 11, color: C.secondary, marginTop: 1 }}>{acc.institution}</div>
        </div>
        <div style={{
          fontSize: 13, fontFeatureSettings: "'tnum'",
          color: acc.current_balance < 0 ? C.negative : C.text,
        }}>
          {fmt(acc.current_balance, visible)}
        </div>
      </div>

      {acc.cards.map(card => (
        <div key={card.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '7px 14px 7px 36px',
          background: C.subrow,
          borderTop: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 12, color: C.secondary }}>{card.name}</div>
          <div style={{
            fontSize: 12, fontFeatureSettings: "'tnum'",
            color: card.current_balance < 0 ? C.negative : C.secondary,
          }}>
            {fmt(card.current_balance, visible)}
          </div>
        </div>
      ))}
    </>
  )
}

// ── Fila pasivo ───────────────────────────────────────────────
function FilaLiability({ lib, visible }: { lib: Liability; visible: boolean }) {
  const rate = lib.interest_rate ? ` · ${(Number(lib.interest_rate) * 100).toFixed(2)}%` : ''
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 14px',
      borderTop: `1px solid ${C.border}`,
    }}>
      <div>
        <div style={{ fontSize: 13, color: C.text }}>{lib.name}</div>
        <div style={{ fontSize: 11, color: C.secondary, marginTop: 1 }}>
          {lib.lender ?? lib.type}{rate}
        </div>
      </div>
      <div style={{ fontSize: 13, fontFeatureSettings: "'tnum'", color: C.negative }}>
        {fmt(-Number(lib.current_balance), visible)}
      </div>
    </div>
  )
}

// ── Sección colapsable ────────────────────────────────────────
function SeccionCard({
  sec, isOpen, onToggle, visible, color,
}: {
  sec: GrupoSection; isOpen: boolean; onToggle: () => void
  visible: boolean; color: string
}) {
  const isEmpty = sec.accounts.length === 0 && sec.liabilities.length === 0

  return (
    <div style={{
      background: C.surface, borderRadius: 10,
      border: `1px solid ${C.border}`, overflow: 'hidden',
    }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center',
        padding: '11px 14px', background: 'none', border: 'none',
        cursor: 'pointer', textAlign: 'left', gap: 10,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: color, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 10, color: '#fff', fontWeight: 500 }}>{sec.roman}</span>
        </div>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.text }}>{sec.label}</div>
        <div style={{
          fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 400,
          color: sec.id === 'deudas' ? C.negative : C.text,
          fontFeatureSettings: "'tnum'", marginRight: 4,
        }}>
          {fmt(sec.total, visible)}
        </div>
        <span style={{
          color: C.secondary, fontSize: 16, lineHeight: 1,
          display: 'inline-block',
          transform: isOpen ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.18s ease',
        }}>›</span>
      </button>

      {isOpen && (
        <div>
          {sec.accounts.map(acc => (
            <FilaAccount key={acc.id} acc={acc} visible={visible} />
          ))}
          {sec.liabilities.map(lib => (
            <FilaLiability key={lib.id} lib={lib} visible={visible} />
          ))}
          {isEmpty && (
            <div style={{
              padding: '10px 14px', fontSize: 12,
              color: C.secondary, fontStyle: 'italic',
              borderTop: `1px solid ${C.border}`,
            }}>
              Sin cuentas en esta categoría
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────
export default function CuentasClient({ data }: { data: CuentasPageData }) {
  const { secciones, patrimonioDetalle, stockOptions, userRole } = data
  const [visible, setVisible] = useState(true)
  const [open, setOpen] = useState<Set<string>>(new Set(['corriente']))

  const toggle = (id: string) =>
    setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const otherUser = userRole === 'eric' ? 'Ana' : 'Eric'
  const totalAbs  = secciones.reduce((s, sec) => s + Math.abs(sec.total), 0) || 1

  return (
    <div style={{
      background: C.bg, minHeight: '100vh', color: C.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      maxWidth: 420, margin: '0 auto', paddingBottom: 48,
    }}>

      {/* Cabecera */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 20px 0',
      }}>
        <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', color: C.secondary }}>
          EGMFIN · {USER_LABEL[userRole]}
        </span>
        <button onClick={() => setVisible(v => !v)} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: C.secondary, padding: 4,
        }} aria-label={visible ? 'Ocultar cifras' : 'Mostrar cifras'}>
          {visible ? <EyeIcon /> : <EyeOffIcon />}
        </button>
      </div>

      {/* Barra de asignación */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ fontSize: 10, color: C.secondary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Asignación por clase
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
          {secciones.map(sec => {
            const pct = (Math.abs(sec.total) / totalAbs) * 100
            if (pct < 0.5) return null
            return <div key={sec.id} style={{ width: `${pct}%`, background: SECTION_COLOR[sec.id], minWidth: 2 }} />
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 12px', marginTop: 8 }}>
          {secciones.map(sec => {
            const pct = (Math.abs(sec.total) / totalAbs) * 100
            if (pct < 0.5) return null
            return (
              <div key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: SECTION_COLOR[sec.id] }} />
                <span style={{ fontSize: 10, color: C.secondary }}>{sec.roman} · {pct.toFixed(0)}%</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Patrimonio neto */}
      <div style={{ padding: '20px 0 0' }}>
        <PatrimonioNetoCard data={patrimonioDetalle} visible={visible} />
      </div>

      {/* Stock options */}
      {stockOptions.length > 0 && (
        <div style={{ padding: '8px 0 0' }}>
          <StockOptionsCard options={stockOptions} visible={visible} />
        </div>
      )}

      {/* Secciones colapsables */}
      <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {secciones.map(sec => (
          <SeccionCard
            key={sec.id} sec={sec}
            isOpen={open.has(sec.id)} onToggle={() => toggle(sec.id)}
            visible={visible} color={SECTION_COLOR[sec.id]}
          />
        ))}
      </div>

      {/*
        Línea de privacidad: muestra que el otro usuario tiene cuentas no visibles.
        TODO v2: mostrar esta línea dentro de cada sección donde el otro usuario
        tiene cuentas privadas, en lugar de una sola línea global. Requiere traer
        metadata de esas cuentas con una función security definer bypassando RLS.
      */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '10px 20px', margin: '0 16px',
      }}>
        <span style={{ fontSize: 11, color: C.secondary, fontStyle: 'italic' }}>
          Cuentas de {otherUser} · privado
        </span>
        <span style={{ fontSize: 11, color: C.secondary, fontStyle: 'italic', letterSpacing: '0.15em' }}>
          — — —
        </span>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 20px 0',
      }}>
        <span style={{ fontSize: 11, color: C.secondary }}>
          Valoración: {new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
        {/* Sin handler — funcionalidad en Fase 1 posterior */}
        <span style={{ fontSize: 12, color: C.accent, fontWeight: 500, opacity: 0.5 }}>
          + Añadir cuenta
        </span>
      </div>

    </div>
  )
}
