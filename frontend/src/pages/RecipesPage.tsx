import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CopyPlus, Plus, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { api, displayError, formatDateTime } from '../lib/api'
import type { RecipeRevision } from '../types'

export function RecipesPage() {
  const { user } = useAuth()
  const [recipes, setRecipes] = useState<RecipeRevision[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api<RecipeRevision[]>('/api/recipes').then(setRecipes).catch((reason) => setError(displayError(reason)))
  }, [])

  const filtered = useMemo(
    () =>
      recipes.filter((recipe) =>
        `${recipe.recipeCode} ${recipe.compoundName} ${recipe.revisionNumber} ${recipe.status}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [recipes, query],
  )
  const canManage = ['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')

  return (
    <div>
      <PageHeader
        eyebrow="Controlled formulations"
        title="Digital recipe revisions"
        description="Revisions are append-only. Historical batches continue to point to the exact formulation originally selected."
        actions={canManage ? <Link to="/recipes/new" className="btn-primary"><Plus size={18} /> Create revision</Link> : undefined}
      />

      <div className="card mb-5 p-4">
        <div className="relative max-w-xl">
          <Search className="absolute left-3.5 top-3 text-slate-400" size={18} />
          <input className="field pl-11" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, compound, revision, or status…" />
        </div>
      </div>
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {filtered.length === 0 ? (
        <EmptyState title="No recipe revisions found" message="Create an initial digital recipe revision to begin batch planning." />
      ) : (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Recipe</th>
                <th>Revision</th>
                <th>Effective date</th>
                <th>Ingredients</th>
                <th>Created / Approved</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((recipe) => (
                <tr key={recipe.id} className="hover:bg-slate-50">
                  <td>
                    <p className="font-black text-ink">{recipe.recipeCode}</p>
                    <p className="mt-1 text-xs text-slate-500">{recipe.compoundName}</p>
                  </td>
                  <td className="font-bold">Rev {recipe.revisionNumber}</td>
                  <td>{new Date(`${recipe.effectiveDate}T00:00:00`).toLocaleDateString('en-LK', { dateStyle: 'medium' })}</td>
                  <td>{recipe.ingredients.length} materials</td>
                  <td>
                    <p>{recipe.createdBy.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">{recipe.approvedBy ? `Approved by ${recipe.approvedBy.fullName}` : `Updated ${formatDateTime(recipe.lastUpdatedDate)}`}</p>
                  </td>
                  <td><StatusBadge status={recipe.status} /></td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      {canManage && (
                        <Link to={`/recipes/new?from=${recipe.id}`} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" title="Create a new revision">
                          <CopyPlus size={17} />
                        </Link>
                      )}
                      <Link to={`/recipes/${recipe.id}`} className="grid h-10 w-10 place-items-center rounded-xl text-process hover:bg-blue-50" aria-label={`Open ${recipe.recipeCode} revision ${recipe.revisionNumber}`}>
                        <ArrowRight size={18} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

