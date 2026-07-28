import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, CopyPlus, FileCheck2, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { api, displayError, formatDateTime } from '../lib/api'
import type { RecipeRevision } from '../types'

export function RecipeDetailsPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [recipe, setRecipe] = useState<RecipeRevision | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<RecipeRevision>(`/api/recipes/${id}`).then(setRecipe).catch((reason) => setError(displayError(reason)))
  }, [id])

  if (!recipe) return <div className="card p-8 text-sm text-slate-600">{error || 'Loading recipe revision…'}</div>
  const canManage = ['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')

  return (
    <div>
      <PageHeader
        eyebrow="Recipe revision record"
        title={`${recipe.recipeCode} · Revision ${recipe.revisionNumber}`}
        description={recipe.compoundName}
        actions={
          <>
            <StatusBadge status={recipe.status} />
            {canManage && <Link to={`/recipes/new?from=${recipe.id}`} className="btn-primary"><CopyPlus size={17} /> New revision</Link>}
            <Link to="/recipes" className="btn-secondary"><ArrowLeft size={17} /> Back</Link>
          </>
        }
      />
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="mb-6 grid grid-cols-4 gap-4">
        {[
          { icon: CalendarDays, label: 'Effective date', value: new Date(`${recipe.effectiveDate}T00:00:00`).toLocaleDateString('en-LK', { dateStyle: 'long' }) },
          { icon: UserRound, label: 'Created by', value: recipe.createdBy.fullName },
          { icon: FileCheck2, label: 'Approved by', value: recipe.approvedBy?.fullName ?? 'Approval not recorded' },
          { icon: CalendarDays, label: 'Last updated', value: formatDateTime(recipe.lastUpdatedDate) },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="card flex items-center gap-4 p-5">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icon size={20} /></div>
            <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-ink">{value}</p></div>
          </div>
        ))}
      </div>

      <section className="card mb-6 p-6">
        <h2 className="text-lg font-black text-ink">Revision notes</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">{recipe.revisionNotes || 'No revision notes were recorded.'}</p>
      </section>

      <section className="table-shell">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-black text-ink">Ingredient addition sequence</h2>
            <p className="mt-1 text-xs text-slate-500">Required quantities and optional process parameters</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{recipe.ingredients.length} ingredients</span>
        </div>
        <table>
          <thead><tr><th>Seq.</th><th>Stage</th><th>Material</th><th>Required</th><th>Process parameters</th><th>Instructions</th></tr></thead>
          <tbody>
            {recipe.ingredients.map((ingredient) => (
              <tr key={ingredient.id}>
                <td className="font-black">{ingredient.additionSequence}</td>
                <td><span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">Stage {ingredient.stageNumber}</span></td>
                <td><p className="font-bold text-ink">{ingredient.materialName}</p><p className="mt-1 text-xs text-slate-500">{ingredient.materialCode}</p></td>
                <td className="font-bold">{ingredient.requiredQuantity} {ingredient.unit}</td>
                <td className="text-xs leading-5 text-slate-500">
                  <p>Time: {ingredient.mixingTimeSeconds ? `${ingredient.mixingTimeSeconds}s` : 'TBC'}</p>
                  <p>Temperature: {ingredient.temperatureCelsius ? `${ingredient.temperatureCelsius}°C` : 'TBC'}</p>
                  <p>Speed: {ingredient.speedRpm ? `${ingredient.speedRpm} rpm` : 'TBC'}</p>
                </td>
                <td className="max-w-md text-sm leading-6 text-slate-600">{ingredient.instructions || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

