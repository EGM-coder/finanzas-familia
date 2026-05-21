'use client'
import React from 'react'
import Toggle from './Toggle'
import RadioChips, { RadioOption } from './RadioChips'

interface BaseParamRow {
  label: string
  sublabel?: string
}

interface ReadonlyParamRow extends BaseParamRow {
  variant: 'readonly'
  value?: string | number
}

interface TextParamRow extends BaseParamRow {
  variant: 'text'
  value?: string | number
}

interface ToggleParamRow extends BaseParamRow {
  variant: 'toggle'
  on: boolean
  onChange: (next: boolean) => void
}

interface RadioParamRow extends BaseParamRow {
  variant: 'radio'
  options: RadioOption[]
  active?: string
  onChange: (value: string) => void
}

interface SelectParamRow extends BaseParamRow {
  variant: 'select'
  options: Array<{ value: string; label: string }>
  value?: string
  onChange: (value: string) => void
}

interface DrillParamRow extends BaseParamRow {
  variant: 'drill'
  value?: string
  onClick: () => void
}

interface DisabledParamRow extends BaseParamRow {
  variant: 'disabled'
  value?: string
}

type ParamRowProps =
  | ReadonlyParamRow
  | TextParamRow
  | ToggleParamRow
  | RadioParamRow
  | SelectParamRow
  | DrillParamRow
  | DisabledParamRow

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '14px 0',
  borderBottom: '1px solid var(--rule)',
}

const labelStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
}

export function ParamRow(props: ParamRowProps) {
  const isDisabled = props.variant === 'disabled'

  return (
    <div style={{ ...rowStyle, opacity: isDisabled ? 0.4 : 1 }}>
      <div style={labelStyle}>
        <div
          className="label"
          style={{ color: 'var(--ink-2)', fontSize: 11, letterSpacing: '0.12em' }}
        >
          {props.label}
        </div>
        {props.sublabel && (
          <div
            className="roman"
            style={{ fontSize: 12, marginTop: 2, color: 'var(--ink-4)' }}
          >
            {props.sublabel}
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0 }}>
        {(props.variant === 'readonly' || props.variant === 'disabled') && (
          <span className="num" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            {props.value ?? '—'}
          </span>
        )}
        {props.variant === 'text' && (
          <span className="num" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            {props.value ?? '—'}
          </span>
        )}
        {props.variant === 'toggle' && (
          <Toggle on={props.on} onChange={props.onChange} />
        )}
        {props.variant === 'radio' && (
          <RadioChips
            options={props.options}
            active={props.active}
            onChange={props.onChange}
          />
        )}
        {props.variant === 'select' && (
          <select
            className="num"
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 13,
              border: '1px solid var(--rule)',
              background: 'var(--bg)',
              color: 'var(--ink)',
              padding: '6px 10px',
              cursor: 'pointer',
            }}
          >
            {props.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {props.variant === 'drill' && (
          <button
            type="button"
            onClick={props.onClick}
            className="label"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink-3)',
              fontSize: 11,
              letterSpacing: '0.12em',
            }}
          >
            {props.value && <span>{props.value}</span>}
            <span style={{ fontSize: 14 }}>›</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default ParamRow
