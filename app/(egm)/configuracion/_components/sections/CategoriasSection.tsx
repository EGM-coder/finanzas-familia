'use client'
import { useReducer, useState } from 'react'
import { toast } from 'sonner'
import { SectionTitle } from '@/components/egm/SectionTitle'
import { EditorialBlock } from '@/components/egm/EditorialBlock'
import { Btn } from '@/components/egm'
import { ColorSwatch } from '@/components/egm/ColorSwatch'
import { ColorPicker } from '@/components/egm/ColorPicker'
import {
  createCategory,
  updateCategory,
  archiveCategory,
  restoreCategory,
} from '../../_actions/categories'

// ── Types ────────────────────────────────────────────────────

export interface Category {
  id: string
  name: string
  parent_id: string | null
  color: string | null
  is_default: boolean
  is_active: boolean
  visibility: string | null
  sort_order: number
}

interface Props {
  categories: Category[]
}

type Visibility = 'privada_eric' | 'privada_ana' | 'compartida'

interface NewForm {
  name: string
  parent_id: string
  visibility: Visibility
  color: string
}

interface EditForm {
  name: string
  visibility: Visibility
  color: string
}

const VISIBILITY_LABELS: Record<string, string> = {
  privada_eric: 'Eric',
  privada_ana: 'Ana',
  compartida: 'Compartida',
}

// ── Component ────────────────────────────────────────────────

export function CategoriasSection({ categories }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)

  const [newForm, setNewForm] = useReducer(
    (s: NewForm, p: Partial<NewForm>) => ({ ...s, ...p }),
    { name: '', parent_id: '', visibility: 'compartida', color: '' }
  )
  const [editForm, setEditForm] = useReducer(
    (s: EditForm, p: Partial<EditForm>) => ({ ...s, ...p }),
    { name: '', visibility: 'compartida', color: '' }
  )

  // Color collision set (all colors already used)
  const existingHexes = categories.map((c) => c.color).filter(Boolean) as string[]

  // Resolve color for a category (own color or nearest parent's color)
  function resolveColor(cat: Category): string | null {
    if (cat.color) return cat.color
    if (!cat.parent_id) return null
    const parent = categories.find((c) => c.id === cat.parent_id)
    return parent?.color ?? null
  }

  // Default parents — for the reference tree and for parent selector
  const defaultParents = categories
    .filter((c) => c.is_default && !c.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order)

  // User's own categories (is_default=false)
  const ownActive = categories.filter((c) => !c.is_default && c.is_active)
  const ownArchived = categories.filter((c) => !c.is_default && !c.is_active)

  // Selector options for parent (all active categories)
  const parentOptions = [
    { id: '', name: '— Sin categoría padre —' },
    ...categories.filter((c) => c.is_active).sort((a, b) => a.name.localeCompare(b.name)),
  ]

  // ── Handlers ───────────────────────────────────────────────

  function openEdit(cat: Category) {
    setEditingId(cat.id)
    setEditForm({
      name: cat.name,
      visibility: (cat.visibility as Visibility) ?? 'compartida',
      color: cat.color ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function submitEdit(id: string) {
    if (!editForm.name.trim()) { toast.error('El nombre es obligatorio.'); return }
    setSaving(true)
    const res = await updateCategory(id, {
      name: editForm.name.trim(),
      visibility: editForm.visibility,
      color: editForm.color || null,
    })
    setSaving(false)
    if (res?.error) { toast.error('No he podido guardar el cambio.'); return }
    toast('Guardado.')
    setEditingId(null)
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault()
    if (!newForm.name.trim()) { toast.error('El nombre es obligatorio.'); return }
    setSaving(true)
    const res = await createCategory({
      name: newForm.name.trim(),
      parent_id: newForm.parent_id || null,
      visibility: newForm.visibility,
      color: newForm.color || undefined,
    })
    setSaving(false)
    if (res?.error) { toast.error('No he podido guardar el cambio.'); return }
    toast('Guardado.')
    setShowNew(false)
    setNewForm({ name: '', parent_id: '', visibility: 'compartida', color: '' })
  }

  async function handleArchive(id: string) {
    const res = await archiveCategory(id)
    if (res?.error) { toast.error('No he podido archivar la categoría.'); return }
    toast('Guardado.')
  }

  async function handleRestore(id: string) {
    const res = await restoreCategory(id)
    if (res?.error) { toast.error('No he podido restaurar la categoría.'); return }
    toast('Guardado.')
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="fade fade-1">
      <SectionTitle chapter="Configuración" title="Categorías" />

      {/* ── Categorías de base (read-only) ─────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div className="label" style={{ color: 'var(--ink-2)', marginBottom: 8 }}>
          Categorías de base
        </div>
        <EditorialBlock style={{ marginBottom: 12 }}>
          <p>Las categorías del sistema son de solo lectura. No se pueden editar ni archivar.</p>
        </EditorialBlock>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {defaultParents.map((parent) => (
            <div
              key={parent.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                border: '1px solid var(--rule)',
                background: 'var(--bg-soft)',
              }}
            >
              <ColorSwatch hex={parent.color} size={10} />
              <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{parent.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rule-dot" style={{ marginBottom: 24 }} />

      {/* ── Mis categorías ─────────────────────────────────── */}
      <div>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}
        >
          <div className="label" style={{ color: 'var(--ink-2)' }}>Mis categorías</div>
          {!showNew && (
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="label"
              style={{ fontSize: 10, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.12em' }}
            >
              + Nueva
            </button>
          )}
        </div>

        {ownActive.length === 0 && !showNew && (
          <p className="roman" style={{ fontSize: 13, color: 'var(--ink-4)', padding: '10px 0' }}>
            Sin categorías propias. Crea una para empezar.
          </p>
        )}

        {ownActive.map((cat) => {
          const color = resolveColor(cat)
          const parentName = cat.parent_id
            ? categories.find((c) => c.id === cat.parent_id)?.name
            : null

          if (editingId === cat.id) {
            return (
              <div key={cat.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--rule)' }}>
                <EditInlineForm
                  form={editForm}
                  onChange={setEditForm}
                  existingHexes={existingHexes}
                  onSave={() => submitEdit(cat.id)}
                  onCancel={cancelEdit}
                  saving={saving}
                />
              </div>
            )
          }

          return (
            <div
              key={cat.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--rule)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ColorSwatch hex={color} size={12} />
                <div>
                  <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{cat.name}</span>
                  {parentName && (
                    <span className="roman" style={{ fontSize: 11, marginLeft: 6, color: 'var(--ink-4)' }}>
                      › {parentName}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="label" style={{ fontSize: 9, color: 'var(--ink-4)' }}>
                  {VISIBILITY_LABELS[cat.visibility ?? ''] ?? cat.visibility}
                </span>
                <button
                  type="button"
                  onClick={() => openEdit(cat)}
                  className="label"
                  style={{ fontSize: 9, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.12em' }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleArchive(cat.id)}
                  className="label"
                  style={{ fontSize: 9, color: 'var(--ink-4)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.12em' }}
                >
                  Archivar
                </button>
              </div>
            </div>
          )
        })}

        {/* Nueva categoría form */}
        {showNew && (
          <form
            onSubmit={submitNew}
            style={{ padding: '16px 0', borderBottom: '1px solid var(--rule)' }}
          >
            <div className="label" style={{ fontSize: 10, color: 'var(--ink-2)', marginBottom: 12 }}>
              Nueva categoría
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <CatFieldGroup label="Nombre *">
                <input
                  type="text"
                  value={newForm.name}
                  onChange={(e) => setNewForm({ name: e.target.value })}
                  required
                  autoFocus
                  style={inputStyle}
                  placeholder="Nombre de la categoría"
                />
              </CatFieldGroup>

              <CatFieldGroup label="Categoría padre">
                <select
                  value={newForm.parent_id}
                  onChange={(e) => setNewForm({ parent_id: e.target.value })}
                  style={inputStyle}
                >
                  {parentOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </CatFieldGroup>

              <CatFieldGroup label="Visibilidad">
                <select
                  value={newForm.visibility}
                  onChange={(e) => setNewForm({ visibility: e.target.value as Visibility })}
                  style={inputStyle}
                >
                  <option value="compartida">Compartida</option>
                  <option value="privada_eric">Solo Eric</option>
                  <option value="privada_ana">Solo Ana</option>
                </select>
              </CatFieldGroup>

              <CatFieldGroup label="Color">
                <ColorPicker
                  value={newForm.color || null}
                  onChange={(hex) => setNewForm({ color: hex })}
                  existingHexes={existingHexes}
                />
              </CatFieldGroup>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <Btn
                variant="ghost"
                onClick={() => { setShowNew(false); setNewForm({ name: '', parent_id: '', visibility: 'compartida', color: '' }) }}
                style={smallBtnStyle}
              >
                Cancelar
              </Btn>
              <Btn variant="fill" type="submit" disabled={saving} style={smallBtnStyle}>
                {saving ? '…' : 'Crear'}
              </Btn>
            </div>
          </form>
        )}
      </div>

      {/* ── Archivadas ─────────────────────────────────────── */}
      {ownArchived.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="label" style={{ color: 'var(--ink-4)', marginBottom: 8 }}>
            Archivadas
          </div>
          {ownArchived.map((cat) => (
            <div
              key={cat.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--rule-2)', opacity: 0.5 }}
            >
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{cat.name}</span>
              <button
                type="button"
                onClick={() => handleRestore(cat.id)}
                className="label"
                style={{ fontSize: 9, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.12em' }}
              >
                Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function EditInlineForm({
  form, onChange, existingHexes, onSave, onCancel, saving,
}: {
  form: EditForm
  onChange: (p: Partial<EditForm>) => void
  existingHexes: string[]
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <CatFieldGroup label="Nombre *">
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          required
          autoFocus
          style={inputStyle}
        />
      </CatFieldGroup>

      <CatFieldGroup label="Visibilidad">
        <select
          value={form.visibility}
          onChange={(e) => onChange({ visibility: e.target.value as 'privada_eric' | 'privada_ana' | 'compartida' })}
          style={inputStyle}
        >
          <option value="compartida">Compartida</option>
          <option value="privada_eric">Solo Eric</option>
          <option value="privada_ana">Solo Ana</option>
        </select>
      </CatFieldGroup>

      <CatFieldGroup label="Color" style={{ gridColumn: '1 / -1' }}>
        <ColorPicker
          value={form.color || null}
          onChange={(hex) => onChange({ color: hex })}
          existingHexes={existingHexes}
        />
      </CatFieldGroup>

      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onCancel} style={smallBtnStyle}>Cancelar</Btn>
        <Btn variant="fill" onClick={onSave} disabled={saving} style={smallBtnStyle}>
          {saving ? '…' : 'Guardar'}
        </Btn>
      </div>
    </div>
  )
}

function CatFieldGroup({
  label, children, style,
}: {
  label: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
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
