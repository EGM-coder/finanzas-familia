import React from 'react'

interface EditorialBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function EditorialBlock({ children, style, ...rest }: EditorialBlockProps) {
  return (
    <div
      className="body"
      style={{
        fontSize: 14,
        lineHeight: 1.55,
        color: 'var(--ink-3)',
        maxWidth: 480,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}

export default EditorialBlock
