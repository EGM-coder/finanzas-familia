'use client'

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

const FIELD_OPTIONS: { value: MatchField; label: string }[] = [
  { value: 'counterparty', label: 'Counterparty' },
  { value: 'raw_concept',  label: 'Concepto bruto' },
  { value: 'description',  label: 'Descripción' },
]

function getDefaultField(tx: Tx): MatchField {
  if (tx.counterparty) return 'counterparty'
  if (tx.description)  return 'description'
  return 'raw_concept'
}

function getTxValue(tx: Tx, field: MatchField): string {
  return tx[field] ?? ''
}

import { useState } from 'react'

export function RuleSubForm({ transaction, categoryId, onCreate, isSaving }: Props) {
  const [matchField, setMatchField] = useState<MatchField>(() => getDefaultField(transaction))
  const [matchValue, setMatchValue] = useState<string>(() => getTxValue(transaction, getDefaultField(transaction)))

  function handleFieldChange(field: MatchField) {
    setMatchField(field)
    setMatchValue(getTxValue(transaction, field))
  }

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
      <div role="radiogroup" aria-label="Campo de matching"
        style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        {FIELD_OPTIONS.map((opt) => {
          const active = opt.value === matchField
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => handleFieldChange(opt.value)}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--ink-2)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--ink-3)' }}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 0',
                fontFamily: 'var(--sans)',
                fontSize: 14,
                color: active ? 'var(--ink-1)' : 'var(--ink-3)',
                textDecoration: active ? 'underline' : 'none',
                textUnderlineOffset: 4,
                textDecorationThickness: 1,
                cursor: active ? 'default' : 'pointer',
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
        Operador <code style={{ fontFamily: 'var(--mono)', fontSize: 11, fontStyle: 'normal' }}>contains</code>.{' '}
        Cuando una txn nueva matchee, se aplicará la categoría, proyecto y naturaleza seleccionados.
      </p>

      {/* Crear button */}
      <button
        type="button"
        disabled={!canCreate}
        onClick={() => onCreate(matchField, matchValue)}
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
