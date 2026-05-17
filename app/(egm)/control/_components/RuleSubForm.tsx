'use client'

import { useState, useEffect } from 'react'
import type { NatureValue } from './NatureSelect'
import type { MatchField } from '../_actions/createRule'

type Tx = {
  counterparty: string | null
  raw_concept: string | null
  description: string | null
}

interface Props {
  transaction: Tx
  categoryId: string | null
  projectId: string | null
  nature: NatureValue | null
  onCreate: (matchField: MatchField, matchValue: string) => Promise<void>
  isSaving: boolean
}

const FIELD_OPTIONS = [
  { value: 'counterparty' as MatchField, label: 'Counterparty' },
  { value: 'raw_concept'  as MatchField, label: 'Concepto bruto' },
  { value: 'description'  as MatchField, label: 'Descripción' },
]

function getDefaultField(tx: Tx): MatchField {
  if (tx.counterparty) return 'counterparty'
  if (tx.description)  return 'description'
  return 'raw_concept'
}

export function RuleSubForm({ transaction, categoryId, onCreate, isSaving }: Props) {
  const initialField = getDefaultField(transaction)

  const [matchField, setMatchField] = useState<MatchField>(initialField)
  const [matchValue, setMatchValue] = useState<string>(
    (transaction[initialField] as string | null) ?? ''
  )

  useEffect(() => {
    setMatchValue((transaction[matchField] as string | null) ?? '')
  }, [matchField, transaction])

  const canCreate = matchValue.trim().length > 0 && categoryId !== null && !isSaving

  return (
    <div style={{
      borderTop: '1px solid var(--rule-2)',
      paddingTop: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}>

      {/* Label */}
      <div style={{
        fontFamily: 'var(--sans)',
        fontSize: 11,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'var(--ink-3)',
      }}>
        Regla
      </div>

      {/* Match field radios */}
      <div
        role="radiogroup"
        aria-label="Campo de matching"
        style={{ display: 'flex', gap: 24, alignItems: 'center', height: 40, marginTop: 4, marginBottom: 8 }}
      >
        {FIELD_OPTIONS.map((opt) => {
          const isActive = matchField === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setMatchField(opt.value)}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--ink-2)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--ink-3)' }}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 0,
                padding: '4px 0',
                margin: 0,
                fontFamily: 'var(--sans)',
                fontSize: 14,
                color: isActive ? 'var(--ink-1)' : 'var(--ink-3)',
                textDecoration: isActive ? 'underline' : 'none',
                textUnderlineOffset: 4,
                textDecorationThickness: 1,
                cursor: isActive ? 'default' : 'pointer',
                transition: 'color 150ms ease',
                outline: 'none',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Match value input */}
      <input
        type="text"
        value={matchValue}
        onChange={e => setMatchValue(e.target.value)}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--ink-2)' }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--rule)' }}
        style={{
          height: 40,
          boxSizing: 'border-box',
          border: '1px solid var(--rule)',
          borderRadius: 0,
          padding: '0 12px',
          fontFamily: 'var(--mono)',
          fontSize: 13,
          color: 'var(--ink-1)',
          background: 'transparent',
          width: '100%',
          outline: 'none',
          transition: 'border-color 150ms ease',
        }}
      />

      {/* Hint */}
      <p style={{
        margin: 0,
        fontFamily: 'var(--sans)',
        fontSize: 12,
        fontStyle: 'italic',
        color: 'var(--ink-3)',
        lineHeight: 1.5,
      }}>
        Operador{' '}
        <code style={{ fontFamily: 'var(--mono)', fontSize: 11, fontStyle: 'normal' }}>contains</code>.{' '}
        Cuando una txn nueva matchee, se aplicará la categoría, proyecto y naturaleza seleccionados.
      </p>

      {/* Crear button */}
      <button
        type="button"
        disabled={!canCreate}
        onClick={() => onCreate(matchField, matchValue.trim())}
        style={{
          alignSelf: 'flex-end',
          fontFamily: 'var(--sans)',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '8px 16px',
          background: 'var(--ink-1)',
          border: '1px solid var(--ink-1)',
          borderRadius: 0,
          color: canCreate ? 'var(--paper)' : 'var(--ink-3)',
          fontStyle: isSaving ? 'italic' : 'normal',
          cursor: canCreate ? 'pointer' : 'not-allowed',
          opacity: canCreate ? 1 : 0.3,
          transition: 'opacity 150ms ease',
        }}
      >
        {isSaving ? 'Guardando…' : 'Crear regla y guardar'}
      </button>
    </div>
  )
}
