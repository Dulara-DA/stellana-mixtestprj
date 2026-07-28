import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Save, ShieldAlert } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { api, displayError } from '../lib/api'
import type { Batch, RecipeRevision, User } from '../types'

export function CreateBatchPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [recipes, setRecipes] = useState<RecipeRevision[]>([])
  const [officers, setOfficers] = useState<User[]>([])
  const [sourceBatches, setSourceBatches] = useState<Batch[]>([])
  const [form, setForm] = useState({
    batchNumber: '',
    recipeRevisionId: '',
    plannedQuantityKg: '',
    machine: 'Mixer A',
    assignedOfficerId: '',
    reprocessingSourceBatchId: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const isOfficer = user?.role === 'MIXING_OFFICER'
  const selectedRecipe = recipes.find((recipe) => recipe.id === Number(form.recipeRevisionId))
  const factoryReference = selectedRecipe && form.batchNumber.trim()
    ? `${selectedRecipe.recipeCode} × ${form.batchNumber.trim().toUpperCase()}`
    : 'Select a recipe and enter the factory batch number'

  useEffect(() => {
    const officerRequest = user?.role === 'MIXING_OFFICER'
      ? Promise.resolve(user ? [user] : [])
      : api<User[]>('/api/users/officers')

    Promise.all([
      api<RecipeRevision[]>('/api/recipes/active'),
      officerRequest,
      api<Batch[]>('/api/batches'),
    ])
      .then(([recipeData, officerData, batchData]) => {
        setRecipes(recipeData)
        setOfficers(officerData)
        setSourceBatches(batchData.filter((batch) => ['LAB_FAILED', 'REPROCESSING'].includes(batch.status)))
        if (user?.role === 'MIXING_OFFICER' && user.id) {
          setForm((current) => ({ ...current, assignedOfficerId: String(user.id) }))
        }
      })
      .catch((reason) => setError(displayError(reason)))
  }, [user])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const batch = await api<{ id: number }>('/api/batches', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          recipeRevisionId: Number(form.recipeRevisionId),
          plannedQuantityKg: Number(form.plannedQuantityKg),
          assignedOfficerId: isOfficer ? null : Number(form.assignedOfficerId),
          reprocessingSourceBatchId: form.reprocessingSourceBatchId ? Number(form.reprocessingSourceBatchId) : null,
        }),
      })
      navigate(`/batches/${batch.id}`)
    } catch (reason) {
      setError(displayError(reason))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Production planning"
        title="Create a mixing batch"
        description={isOfficer
          ? 'Add the physical batch tag and select its exact active recipe. The batch is assigned to you automatically.'
          : 'Select the exact active recipe revision. This reference will remain fixed for the lifetime of the batch.'}
        actions={<Link to="/batches" className="btn-secondary"><ArrowLeft size={17} /> Back to batches</Link>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <form onSubmit={submit} className="card p-5 sm:p-7">
          {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
          <div className="grid gap-5 sm:grid-cols-2">
            <label>
              <span className="label">Factory batch/tag number</span>
              <input
                className="field"
                required
                value={form.batchNumber}
                onChange={(event) => setForm({ ...form, batchNumber: event.target.value })}
                placeholder="e.g. 6078"
              />
              <span className="mt-1.5 block text-xs text-slate-500">
                Enter the number printed on the physical batch tag.
              </span>
            </label>
            <label>
              <span className="label">Planned quantity (kg)</span>
              <input
                className="field"
                required
                type="number"
                min="0.001"
                max="240"
                step="0.001"
                value={form.plannedQuantityKg}
                onChange={(event) => setForm({ ...form, plannedQuantityKg: event.target.value })}
                placeholder="Maximum 240 kg"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="label">Active recipe revision</span>
              <select
                className="field"
                required
                value={form.recipeRevisionId}
                onChange={(event) => setForm({ ...form, recipeRevisionId: event.target.value })}
              >
                <option value="">Select a confirmed active revision</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.recipeCode} · {recipe.compoundName} · Revision {recipe.revisionNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="label">Reprocessing source batch (optional)</span>
              <select
                className="field"
                value={form.reprocessingSourceBatchId}
                onChange={(event) => setForm({ ...form, reprocessingSourceBatchId: event.target.value })}
              >
                <option value="">New production batch</option>
                {sourceBatches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.batchNumber} · {batch.recipeCode} rev {batch.revisionNumber} · {batch.status.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Mixer / machine</span>
              <input
                className="field"
                required
                value={form.machine}
                onChange={(event) => setForm({ ...form, machine: event.target.value })}
              />
            </label>
            {isOfficer ? (
              <div>
                <span className="label">Mixing Officer</span>
                <div className="flex min-h-11 items-center rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm font-bold text-blue-900">
                  {user?.fullName} · Automatically assigned to you
                </div>
              </div>
            ) : (
              <label>
                <span className="label">Assigned Mixing Officer</span>
                <select
                  className="field"
                  required
                  value={form.assignedOfficerId}
                  onChange={(event) => setForm({ ...form, assignedOfficerId: event.target.value })}
                >
                  <option value="">Select officer</option>
                  {officers.map((officer) => (
                    <option key={officer.id} value={officer.id}>{officer.fullName}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="mt-8 flex justify-end gap-3 border-t border-slate-200 pt-6">
            <Link to="/batches" className="btn-secondary">Cancel</Link>
            <button className="btn-primary" type="submit" disabled={loading}>
              <Save size={18} /> {loading ? 'Creating…' : 'Create batch'}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-ink p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Factory stage reference</p>
            <p className="mt-3 break-words text-2xl font-black text-safety">{factoryReference}</p>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Example: recipe A-96 and batch 6078 are tracked as A-96 × 6078 through both stages.
            </p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <ShieldAlert className="mb-3 text-process" size={24} />
            <h3 className="font-black text-blue-950">Revision is preserved</h3>
            <p className="mt-2 text-sm leading-6 text-blue-800">
              Creating a newer recipe later will not change the revision linked to this batch.
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Capacity rule</p>
            <p className="mt-2 text-2xl font-black text-ink">≤ 240 kg</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              The reported 0.7 fill factor is not applied until its formula is confirmed.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
