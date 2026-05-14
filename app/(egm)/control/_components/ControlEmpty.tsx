interface Props {
  filter: 'pendientes' | 'todas'
}

export function ControlEmpty({ filter }: Props) {
  return (
    <div style={{ padding: '64px 0', textAlign: 'center' }}>
      {filter === 'pendientes' ? (
        <>
          <div className="display-it" style={{ fontSize: 24 }}>No hay nada pendiente por aquí.</div>
          <div className="roman" style={{ fontSize: 13, marginTop: 8 }}>Todo catalogado.</div>
        </>
      ) : (
        <div className="display-it" style={{ fontSize: 24 }}>Sin movimientos en este rango.</div>
      )}
    </div>
  )
}
