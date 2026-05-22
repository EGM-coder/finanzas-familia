interface Props {
  children: React.ReactNode
}

export function PlannerGrid({ children }: Props) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2"
      style={{ gap: 1, background: 'var(--rule)' }}
    >
      {children}
    </div>
  )
}
