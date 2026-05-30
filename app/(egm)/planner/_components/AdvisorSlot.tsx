// Contenedor reservado para el Asesor IA (módulo VI). Sin lógica de generación.
// ADV-1: renderiza vacío con placeholder honesto; no invoca IA ni produce sugerencias.
export function AdvisorSlot() {
  return (
    <div
      style={{
        padding: '28px 32px',
        border: '1px dashed var(--rule)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div className="label" style={{ fontSize: 9, color: 'var(--ink-4)', letterSpacing: '0.16em' }}>
        Asesor IA · Reservado
      </div>
      <p
        className="roman"
        style={{ margin: 0, fontSize: 13, color: 'var(--ink-4)', lineHeight: 1.55 }}
      >
        El asesor analizará tu mes cuando esté disponible.
      </p>
    </div>
  )
}
