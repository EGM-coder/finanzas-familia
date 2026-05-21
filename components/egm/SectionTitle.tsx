import React from 'react'

interface SectionTitleProps {
  chapter?: string
  title: string
  subtitle?: string
  size?: 'app' | 'web'
}

export function SectionTitle({ chapter, title, subtitle, size = 'web' }: SectionTitleProps) {
  const fontSize = size === 'app' ? 22 : 36
  return (
    <div style={{ marginBottom: 32 }}>
      {chapter && (
        <div className="label" style={{ marginBottom: 8 }}>
          {chapter}
        </div>
      )}
      <h2
        className="display"
        style={{ fontSize, marginTop: chapter ? 4 : 0 }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="roman" style={{ fontSize: 14, marginTop: 6 }}>
          {subtitle}
        </p>
      )}
      <div className="rule-strong" style={{ marginTop: 20 }} />
    </div>
  )
}

export default SectionTitle
