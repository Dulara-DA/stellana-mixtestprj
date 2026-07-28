import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { api, displayError } from '../lib/api'
import type { RecipeRevision } from '../types'

interface IngredientForm {
  clientId: string
  materialCode: string
  materialName: string
  requiredQuantity: string
  unit: string
  additionSequence: number
  stageNumber: number
  mixingTimeSeconds: string
  temperatureCelsius: string
  speedRpm: string
  instructions: string
}

const blankIngredient = (sequence: number): IngredientForm => ({
  clientId: crypto.randomUUID(),
  materialCode: '',
  materialName: '',
  requiredQuantity: '',
  unit: 'kg',
  additionSequence: sequence,
  stageNumber: 1,
  mixingTimeSeconds: '',
  temperatureCelsius: '',
  speedRpm: '',
  instructions: '',
})

export function RecipeCreatePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sourceId = searchParams.get('from')
  const [form, setForm] = useState({
    recipeCode: '',
    compoundName: '',
    revisionNumber: '',
    effectiveDate: new Date().toISOString().slice(0, 10),
    status: 'DRAFT',
    revisionNotes: '',
  })
  const [ingredients, setIngredients] = useState<IngredientForm[]>([blankIngredient(1)])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!sourceId) return
    api<RecipeRevision>(`/api/recipes/${sourceId}`)
      .then((source) => {
        setForm((current) => ({
          ...current,
          recipeCode: source.recipeCode,
          compoundName: source.compoundName,
          revisionNotes: `New revision based on revision ${source.revisionNumber}.`,
        }))
        setIngredients(source.ingredients.map((item) => ({
          clientId: crypto.randomUUID(),
          materialCode: item.materialCode,
          materialName: item.materialName,
          requiredQuantity: String(item.requiredQuantity),
          unit: item.unit,
          additionSequence: item.additionSequence,
          stageNumber: item.stageNumber,
          mixingTimeSeconds: item.mixingTimeSeconds ? String(item.mixingTimeSeconds) : '',
          temperatureCelsius: item.temperatureCelsius ? String(item.temperatureCelsius) : '',
          speedRpm: item.speedRpm ? String(item.speedRpm) : '',
          instructions: item.instructions ?? '',
        })))
      })
      .catch((reason) => setError(displayError(reason)))
  }, [sourceId])

  const updateIngredient = (index: number, key: keyof IngredientForm, value: string | number) => {
    setIngredients((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const created = await api<{ id: number }>('/api/recipes/revisions', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          ingredients: ingredients.map((item, index) => {
            const { clientId: _clientId, ...ingredient } = item
            return {
              ...ingredient,
              additionSequence: index + 1,
              stageNumber: Number(item.stageNumber),
              requiredQuantity: Number(item.requiredQuantity),
              mixingTimeSeconds: item.mixingTimeSeconds ? Number(item.mixingTimeSeconds) : null,
              temperatureCelsius: item.temperatureCelsius ? Number(item.temperatureCelsius) : null,
              speedRpm: item.speedRpm ? Number(item.speedRpm) : null,
            }
          }),
        }),
      })
      navigate(`/recipes/${created.id}`)
    } catch (reason) {
      setError(displayError(reason))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Revision control"
        title={sourceId ? 'Create a new recipe revision' : 'Create a digital recipe'}
        description="Existing revisions are never edited. Saving this form creates a separate, historically traceable revision."
        actions={<Link to="/recipes" className="btn-secondary"><ArrowLeft size={17} /> Back</Link>}
      />

      <form onSubmit={submit} className="space-y-6">
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        <section className="card p-7">
          <h2 className="mb-5 text-lg font-black text-ink">Revision identity</h2>
          <div className="grid grid-cols-3 gap-5">
            <label><span className="label">Recipe code</span><input className="field" required value={form.recipeCode} onChange={(e) => setForm({ ...form, recipeCode: e.target.value })} readOnly={Boolean(sourceId)} /></label>
            <label className="col-span-2"><span className="label">Compound name</span><input className="field" required value={form.compoundName} onChange={(e) => setForm({ ...form, compoundName: e.target.value })} /></label>
            <label><span className="label">Revision number</span><input className="field" required value={form.revisionNumber} onChange={(e) => setForm({ ...form, revisionNumber: e.target.value })} placeholder="e.g. 3" /></label>
            <label><span className="label">Effective date</span><input className="field" required type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} /></label>
            <label><span className="label">Initial status</span><select className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="DRAFT">Draft</option><option value="ACTIVE">Active (approved for prototype)</option></select></label>
            <label className="col-span-3"><span className="label">Revision notes</span><textarea className="field min-h-24" value={form.revisionNotes} onChange={(e) => setForm({ ...form, revisionNotes: e.target.value })} placeholder="Describe what changed and why." /></label>
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-7 py-5">
            <div><h2 className="text-lg font-black text-ink">Ingredients and addition sequence</h2><p className="mt-1 text-xs text-slate-500">Optional process parameters may remain blank until confirmed.</p></div>
            <button type="button" className="btn-secondary" onClick={() => setIngredients([...ingredients, blankIngredient(ingredients.length + 1)])}><Plus size={17} /> Add ingredient</button>
          </div>
          <div className="space-y-5 p-7">
            {ingredients.map((item, index) => (
              <div key={item.clientId} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-process text-sm font-black text-white">{index + 1}</span><h3 className="font-black text-ink">Addition {index + 1}</h3></div>
                  {ingredients.length > 1 && <button type="button" className="grid h-9 w-9 place-items-center rounded-xl text-red-600 hover:bg-red-50" onClick={() => setIngredients(ingredients.filter((_, i) => i !== index))} aria-label="Remove ingredient"><Trash2 size={17} /></button>}
                </div>
                <div className="grid grid-cols-6 gap-4">
                  <label><span className="label">Material code</span><input className="field" required value={item.materialCode} onChange={(e) => updateIngredient(index, 'materialCode', e.target.value)} /></label>
                  <label className="col-span-2"><span className="label">Material name</span><input className="field" required value={item.materialName} onChange={(e) => updateIngredient(index, 'materialName', e.target.value)} /></label>
                  <label><span className="label">Required qty</span><input className="field" type="number" min="0.001" step="0.001" required value={item.requiredQuantity} onChange={(e) => updateIngredient(index, 'requiredQuantity', e.target.value)} /></label>
                  <label><span className="label">Unit</span><input className="field" required value={item.unit} onChange={(e) => updateIngredient(index, 'unit', e.target.value)} /></label>
                  <label><span className="label">Stage</span><select className="field" value={item.stageNumber} onChange={(e) => updateIngredient(index, 'stageNumber', Number(e.target.value))}><option value={1}>Stage 1</option><option value={2}>Stage 2</option></select></label>
                  <label><span className="label">Time (seconds)</span><input className="field" type="number" min="1" value={item.mixingTimeSeconds} onChange={(e) => updateIngredient(index, 'mixingTimeSeconds', e.target.value)} placeholder="TBC" /></label>
                  <label><span className="label">Temperature °C</span><input className="field" type="number" step="0.1" value={item.temperatureCelsius} onChange={(e) => updateIngredient(index, 'temperatureCelsius', e.target.value)} placeholder="TBC" /></label>
                  <label><span className="label">Speed RPM</span><input className="field" type="number" step="0.1" value={item.speedRpm} onChange={(e) => updateIngredient(index, 'speedRpm', e.target.value)} placeholder="TBC" /></label>
                  <label className="col-span-3"><span className="label">Instructions</span><input className="field" value={item.instructions} onChange={(e) => updateIngredient(index, 'instructions', e.target.value)} placeholder="Optional verified instruction" /></label>
                </div>
              </div>
            ))}
          </div>
        </section>
        <div className="flex justify-end gap-3">
          <Link to="/recipes" className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary" disabled={loading}><Save size={18} /> {loading ? 'Saving…' : 'Save recipe revision'}</button>
        </div>
      </form>
    </div>
  )
}
