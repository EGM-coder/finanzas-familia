'use client'
import { useEffect, useReducer, useState } from 'react'
import { toast } from 'sonner'
import { SectionTitle } from '@/components/egm/SectionTitle'
import { ParamRow } from '@/components/egm/ParamRow'
import { EditorialBlock } from '@/components/egm/EditorialBlock'
import { Btn } from '@/components/egm'
import { fmtAmount, fmtDate } from '@/app/(egm)/_lib/formatters'
import { createIncome, updateIncome, type IncomePayload } from '../../_actions/incomes'

// ── Types ────────────────────────────────────────────────────

interface Income {
  id: string
  date: string
  type: string
  gross_amount: number
  irpf_withheld: number
  ss_withheld: number
  net_amount: number
  employer: string | null
  concept: string | null
}

interface GastoFijo {
  id: string
  name: string
  amount: number
  frequency: 'monthly' | 'annual'
}

interface FixedObservedRow {
  counterparty: string | null
  total_spent: number
  txn_count: number
  avg_amount: number
  first_seen: string
  last_seen: string
}

interface Props {
  medianIncome: number | null
  monthsWithData: number
  incomes: Income[]
  userId: string
  fixedObserved: FixedObservedRow[]
  supermerSpent: number | null
  referenceMonth: { year: number; month: number }
}

// ── Constants ────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  nomina_mensual: 'Nómina mensual',
  paga_extra: 'Paga extra',
  bonus: 'Bonus',
  dietas: 'Dietas',
  otro: 'Otro',
}

const INCOME_KEY = (uid: string) => `egmfin.income_expected.${uid}`
const JOINT_KEY = 'egmfin.income_expected_joint'
const GASTOS_KEY = (uid: string) => `egmfin.gastos_fijos.${uid}`

// ── Empty form ───────────────────────────────────────────────

const emptyForm = (): Omit<IncomePayload, 'net_amount'> & { net_amount: string } => ({
  date: new Date().toISOString().slice(0, 10),
  type: 'nomina_mensual',
  gross_amount: 0,
  irpf_withheld: 0,
  ss_withheld: 0,
  net_amount: '',
  employer: '',
  concept: '',
})

type FormState = ReturnType<typeof emptyForm>

// ── Main section ─────────────────────────────────────────────

export function FinanzasSection({ medianIncome, monthsWithData, incomes, userId, fixedObserved, supermerSpent, referenceMonth }: Props) {
  // Ingreso esperado personal
  const [incomeExpected, setIncomeExpected] = useState<string>('')
  // Ingreso conjunto esperado
  const [incomeJoint, setIncomeJoint] = useState<string>('')
  // Incomes list / form
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useReducer(
    (s: FormState, p: Partial<FormState>) => ({ ...s, ...p }),
    emptyForm()
  )
  const [saving, setSaving] = useState(false)
  // Gastos fijos
  const [gastosFijos, setGastosFijos] = useState<GastoFijo[]>([])
  const [showGastoForm, setShowGastoForm] = useState(false)
  const [gastoForm, setGastoForm] = useState<{ name: string; amount: string; frequency: 'monthly' | 'annual' }>({ name: '', amount: '', frequency: 'monthly' })

  // Load localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(INCOME_KEY(userId))
    setIncomeExpected(stored ?? (medianIncome != null ? String(medianIncome.toFixed(2)) : ''))

    const joint = localStorage.getItem(JOINT_KEY)
    setIncomeJoint(joint ?? '')

    const gastos = localStorage.getItem(GASTOS_KEY(userId))
    setGastosFijos(gastos ? JSON.parse(gastos) : [])
  }, [userId, medianIncome])

  // ── Ingreso esperado ────────────────────────────────────────

  function saveIncomeExpected() {
    localStorage.setItem(INCOME_KEY(userId), incomeExpected)
    toast('Guardado.')
  }

  function saveIncomeJoint() {
    localStorage.setItem(JOINT_KEY, incomeJoint)
    toast('Guardado.')
  }

  // ── Incomes CRUD ────────────────────────────────────────────

  function autoNetAmount(f: FormState): string {
    if (f.gross_amount && f.irpf_withheld != null && f.ss_withheld != null) {
      const net = Number(f.gross_amount) - Number(f.irpf_withheld) - Number(f.ss_withheld)
      return net > 0 ? String(net.toFixed(2)) : ''
    }
    return f.net_amount
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setShowForm(true)
  }

  function openEdit(inc: Income) {
    setEditingId(inc.id)
    setForm({
      date: inc.date,
      type: inc.type,
      gross_amount: inc.gross_amount,
      irpf_withheld: inc.irpf_withheld,
      ss_withheld: inc.ss_withheld,
      net_amount: String(inc.net_amount),
      employer: inc.employer ?? '',
      concept: inc.concept ?? '',
    })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm())
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    const net = parseFloat(form.net_amount) || 0
    if (!net) { toast.error('El importe neto es obligatorio.'); return }

    const payload: IncomePayload = {
      date: form.date,
      type: form.type,
      gross_amount: Number(form.gross_amount) || 0,
      irpf_withheld: Number(form.irpf_withheld) || 0,
      ss_withheld: Number(form.ss_withheld) || 0,
      net_amount: net,
      employer: form.employer || undefined,
      concept: form.concept || undefined,
    }

    setSaving(true)
    const res = editingId
      ? await updateIncome(editingId, payload)
      : await createIncome(payload)
    setSaving(false)

    if (res.error) { toast.error('No he podido guardar el cambio.'); return }
    toast('Guardado.')
    cancelForm()
  }

  // ── Gastos fijos ────────────────────────────────────────────

  function saveGastos(list: GastoFijo[]) {
    localStorage.setItem(GASTOS_KEY(userId), JSON.stringify(list))
    setGastosFijos(list)
  }

  function addGasto(e: React.FormEvent) {
    e.preventDefault()
    if (!gastoForm.name || !gastoForm.amount) return
    const newGasto: GastoFijo = {
      id: crypto.randomUUID(),
      name: gastoForm.name,
      amount: parseFloat(gastoForm.amount),
      frequency: gastoForm.frequency,
    }
    saveGastos([...gastosFijos, newGasto])
    setGastoForm({ name: '', amount: '', frequency: 'monthly' })
    setShowGastoForm(false)
    toast('Guardado.')
  }

  function removeGasto(id: string) {
    saveGastos(gastosFijos.filter((g) => g.id !== id))
    toast('Guardado.')
  }

  // ── Render ──────────────────────────────────────────────────

  const medianRef = medianIncome != null ? fmtAmount(medianIncome) : null
  const medianSublabel = medianRef
    ? `Mediana de ${monthsWithData} mes${monthsWithData !== 1 ? 'es' : ''} · referencia, no decisión`
    : monthsWithData < 3
    ? 'Menos de 3 meses de datos · introduce el valor manualmente'
    : undefined

  return (
    <div className="fade fade-1">
      <SectionTitle chapter="Configuración" title="Finanzas" />

      {/* ── Ingresos esperados ─────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <div className="label" style={{ marginBottom: 14, color: 'var(--ink-2)' }}>
          Ingreso esperado
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 14, borderBottom: '1px solid var(--rule)' }}>
          <div style={{ flex: 1 }}>
            <div className="label" style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--ink-2)' }}>
              Personal
            </div>
            {medianSublabel && (
              <div className="roman" style={{ fontSize: 12, marginTop: 2, color: 'var(--ink-4)' }}>
                {medianSublabel}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {medianRef && (
              <span className="roman" style={{ fontSize: 12, color: 'var(--ink-4)' }}>
                ref. {medianRef}
              </span>
            )}
            <input
              type="number"
              value={incomeExpected}
              onChange={(e) => setIncomeExpected(e.target.value)}
              onBlur={saveIncomeExpected}
              className="num"
              placeholder="0,00"
              style={{
                width: 100,
                padding: '6px 8px',
                border: '1px solid var(--rule)',
                background: 'var(--bg)',
                color: 'var(--ink)',
                fontSize: 13,
                textAlign: 'right',
              }}
            />
            <span className="label" style={{ fontSize: 10 }}>€</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 14, paddingBottom: 14, borderBottom: '1px solid var(--rule)' }}>
          <div style={{ flex: 1 }}>
            <div className="label" style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--ink-2)' }}>
              Conjunto
            </div>
            <div className="roman" style={{ fontSize: 12, marginTop: 2, color: 'var(--ink-4)' }}>
              Conversado entre Eric y Ana.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              value={incomeJoint}
              onChange={(e) => setIncomeJoint(e.target.value)}
              onBlur={saveIncomeJoint}
              className="num"
              placeholder="0,00"
              style={{
                width: 100,
                padding: '6px 8px',
                border: '1px solid var(--rule)',
                background: 'var(--bg)',
                color: 'var(--ink)',
                fontSize: 13,
                textAlign: 'right',
              }}
            />
            <span className="label" style={{ fontSize: 10 }}>€</span>
          </div>
        </div>
      </div>

      {/* ── Ingresos recurrentes ───────────────────────────── */}
      <div style={{ marginTop: 32 }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}
        >
          <div className="label" style={{ color: 'var(--ink-2)' }}>Ingresos recurrentes</div>
          {!showForm && (
            <button
              type="button"
              onClick={openCreate}
              className="label"
              style={{ fontSize: 10, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.12em' }}
            >
              + Añadir
            </button>
          )}
        </div>

        {incomes.length === 0 && !showForm && (
          <p className="roman" style={{ fontSize: 13, color: 'var(--ink-4)', padding: '12px 0' }}>
            Sin registros. Añade tu primera nómina o ingreso.
          </p>
        )}

        {incomes.map((inc) => (
          <div
            key={inc.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--rule)' }}
          >
            <div>
              <span className="label" style={{ fontSize: 10, color: 'var(--ink-3)', marginRight: 8 }}>
                {fmtDate(inc.date)}
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                {TYPE_LABELS[inc.type] ?? inc.type}
              </span>
              {inc.employer && (
                <span className="roman" style={{ fontSize: 12, marginLeft: 6, color: 'var(--ink-4)' }}>
                  · {inc.employer}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="num" style={{ fontSize: 13 }}>{fmtAmount(inc.net_amount)}</span>
              <button
                type="button"
                onClick={() => openEdit(inc)}
                className="label"
                style={{ fontSize: 9, color: 'var(--ink-4)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.12em' }}
              >
                Editar
              </button>
            </div>
          </div>
        ))}

        {showForm && (
          <form
            onSubmit={submitForm}
            style={{
              marginTop: 8,
              padding: 20,
              border: '1px solid var(--rule)',
              background: 'var(--bg-soft)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
            }}
          >
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="label" style={{ fontSize: 10, color: 'var(--ink-2)' }}>
                {editingId ? 'Editar ingreso' : 'Nuevo ingreso'}
              </div>
            </div>

            <FieldGroup label="Fecha">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ date: e.target.value })}
                required
                style={inputStyle}
              />
            </FieldGroup>

            <FieldGroup label="Tipo">
              <select
                value={form.type}
                onChange={(e) => setForm({ type: e.target.value })}
                style={inputStyle}
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </FieldGroup>

            <FieldGroup label="Bruto (€)">
              <input
                type="number"
                step="0.01"
                value={form.gross_amount || ''}
                onChange={(e) => {
                  const f = { ...form, gross_amount: parseFloat(e.target.value) || 0 }
                  setForm({ gross_amount: f.gross_amount, net_amount: autoNetAmount(f) })
                }}
                style={inputStyle}
                placeholder="0,00"
              />
            </FieldGroup>

            <FieldGroup label="IRPF retenido (€)">
              <input
                type="number"
                step="0.01"
                value={form.irpf_withheld || ''}
                onChange={(e) => {
                  const f = { ...form, irpf_withheld: parseFloat(e.target.value) || 0 }
                  setForm({ irpf_withheld: f.irpf_withheld, net_amount: autoNetAmount(f) })
                }}
                style={inputStyle}
                placeholder="0,00"
              />
            </FieldGroup>

            <FieldGroup label="SS retenida (€)">
              <input
                type="number"
                step="0.01"
                value={form.ss_withheld || ''}
                onChange={(e) => {
                  const f = { ...form, ss_withheld: parseFloat(e.target.value) || 0 }
                  setForm({ ss_withheld: f.ss_withheld, net_amount: autoNetAmount(f) })
                }}
                style={inputStyle}
                placeholder="0,00"
              />
            </FieldGroup>

            <FieldGroup label="Neto (€) *">
              <input
                type="number"
                step="0.01"
                value={form.net_amount}
                onChange={(e) => setForm({ net_amount: e.target.value })}
                required
                style={{ ...inputStyle, borderColor: 'var(--ink-3)' }}
                placeholder="0,00"
              />
            </FieldGroup>

            <FieldGroup label="Empresa">
              <input
                type="text"
                value={form.employer}
                onChange={(e) => setForm({ employer: e.target.value })}
                style={inputStyle}
                placeholder="Nordex, …"
              />
            </FieldGroup>

            <FieldGroup label="Concepto">
              <input
                type="text"
                value={form.concept}
                onChange={(e) => setForm({ concept: e.target.value })}
                style={inputStyle}
                placeholder="Nómina marzo, …"
              />
            </FieldGroup>

            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <Btn variant="ghost" onClick={cancelForm} style={smallBtnStyle}>
                Cancelar
              </Btn>
              <Btn variant="fill" type="submit" disabled={saving} style={smallBtnStyle}>
                {saving ? '…' : 'Guardar'}
              </Btn>
            </div>
          </form>
        )}
      </div>

      {/* ── Gastos fijos ──────────────────────────────────── */}
      <div style={{ marginTop: 32 }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}
        >
          <div className="label" style={{ color: 'var(--ink-2)' }}>Gastos fijos</div>
          {!showGastoForm && (
            <button
              type="button"
              onClick={() => setShowGastoForm(true)}
              className="label"
              style={{ fontSize: 10, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.12em' }}
            >
              + Añadir
            </button>
          )}
        </div>

        <EditorialBlock style={{ marginBottom: 12 }}>
          <p>Declaración de planificación. Alimenta la referencia del Planner ZBB.</p>
        </EditorialBlock>

        {gastosFijos.length === 0 && !showGastoForm && (
          <p className="roman" style={{ fontSize: 13, color: 'var(--ink-4)', padding: '12px 0' }}>
            Sin gastos fijos declarados.
          </p>
        )}

        {gastosFijos.map((g) => (
          <div
            key={g.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--rule)' }}
          >
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{g.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="num" style={{ fontSize: 13 }}>{fmtAmount(g.amount)}</span>
              <span className="roman" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                {g.frequency === 'annual' ? '/año' : '/mes'}
              </span>
              <button
                type="button"
                onClick={() => removeGasto(g.id)}
                className="label"
                style={{ fontSize: 9, color: 'var(--ink-4)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.12em' }}
              >
                Quitar
              </button>
            </div>
          </div>
        ))}

        {showGastoForm && (
          <form
            onSubmit={addGasto}
            style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}
          >
            <FieldGroup label="Nombre">
              <input
                type="text"
                value={gastoForm.name}
                onChange={(e) => setGastoForm((g) => ({ ...g, name: e.target.value }))}
                required
                style={{ ...inputStyle, width: 160 }}
                placeholder="Hipoteca, seguro, …"
                autoFocus
              />
            </FieldGroup>
            <FieldGroup label="Importe (€)">
              <input
                type="number"
                step="0.01"
                value={gastoForm.amount}
                onChange={(e) => setGastoForm((g) => ({ ...g, amount: e.target.value }))}
                required
                style={{ ...inputStyle, width: 90 }}
                placeholder="0,00"
              />
            </FieldGroup>
            <FieldGroup label="Periodicidad">
              <select
                value={gastoForm.frequency}
                onChange={(e) => setGastoForm((g) => ({ ...g, frequency: e.target.value as 'monthly' | 'annual' }))}
                style={inputStyle}
              >
                <option value="monthly">Mensual</option>
                <option value="annual">Anual</option>
              </select>
            </FieldGroup>
            <div style={{ display: 'flex', gap: 6, paddingBottom: 1 }}>
              <Btn variant="ghost" onClick={() => setShowGastoForm(false)} style={smallBtnStyle}>
                Cancelar
              </Btn>
              <Btn variant="fill" type="submit" style={smallBtnStyle}>
                Añadir
              </Btn>
            </div>
          </form>
        )}
      </div>

      {/* ── Gastos fijos observados (espejo) ──────────────── */}
      <div style={{ marginTop: 32 }}>
        <div className="label" style={{ color: 'var(--ink-2)', marginBottom: 4 }}>
          Gastos fijos observados
        </div>
        <EditorialBlock style={{ marginBottom: 12 }}>
          <p>
            Lo que ya marcaste como gasto fijo en {MONTH_NAMES[referenceMonth.month - 1]} {referenceMonth.year}.
            Solo agrega; no detecta ni infiere nada.
          </p>
        </EditorialBlock>

        {fixedObserved.length === 0 ? (
          <p className="roman" style={{ fontSize: 13, color: 'var(--ink-4)', padding: '12px 0' }}>
            Sin transacciones marcadas como fijo recurrente este mes.
          </p>
        ) : (
          <>
            {fixedObserved.map((row, i) => (
              <div
                key={i}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--rule)' }}
              >
                <div>
                  <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    {row.counterparty ?? '—'}
                  </span>
                  <span className="roman" style={{ fontSize: 12, marginLeft: 8, color: 'var(--ink-4)' }}>
                    {row.txn_count} mov.
                  </span>
                </div>
                <span className="num" style={{ fontSize: 13 }}>
                  {fmtAmount(Number(row.total_spent))}
                </span>
              </div>
            ))}
            <div
              style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--ink)', marginTop: 2 }}
            >
              <span className="label" style={{ fontSize: 10 }}>Total observado</span>
              <span className="num" style={{ fontSize: 13 }}>
                {fmtAmount(fixedObserved.reduce((s, r) => s + Number(r.total_spent), 0))}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Supermercado observado ─────────────────────────── */}
      <div style={{ marginTop: 32 }}>
        <div className="label" style={{ color: 'var(--ink-2)', marginBottom: 4 }}>
          Supermercado
        </div>
        <EditorialBlock style={{ marginBottom: 12 }}>
          <p>
            Total categorizado en Supermercado en {MONTH_NAMES[referenceMonth.month - 1]} {referenceMonth.year}.
          </p>
        </EditorialBlock>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--rule)' }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Gasto mensual</span>
          <span className="num" style={{ fontSize: 18 }}>
            {supermerSpent != null ? fmtAmount(supermerSpent) : '——'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label className="label" style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--ink-3)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 13,
  padding: '7px 9px',
  border: '1px solid var(--rule)',
  background: 'var(--bg)',
  color: 'var(--ink)',
  width: '100%',
}

const smallBtnStyle: React.CSSProperties = {
  padding: '7px 14px',
  fontSize: 10,
  letterSpacing: '0.1em',
}
