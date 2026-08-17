import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Plus, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { api, displayError, formatDateTime } from '../lib/api'
import type { Batch } from '../types'

export function BatchesPage() {
  const { user } = useAuth()
  const [batches, setBatches] = useState<Batch[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [error, setError] = useState('')

  useEffect(() => {
    api<Batch[]>('/api/batches').then(setBatches).catch((reason) => setError(displayError(reason)))
  }, [])

  const filtered = useMemo(
    () =>
      batches.filter((batch) => {
        const matchesQuery = `${batch.batchNumber} ${batch.recipeCode} ${batch.compoundName} ${batch.assignedOfficer.fullName}`
          .toLowerCase()
          .includes(query.toLowerCase())
        return matchesQuery && (status === 'ALL' || batch.status === status)
      }),
    [batches, query, status],
  )

  return (
    <div>
      <PageHeader
        eyebrow="Production records"
        title={user?.role === 'MIXING_OFFICER' ? 'My assigned batches' : 'Batch control'}
        description="Every batch remains linked to the exact recipe revision selected when it was created."
        actions={
          ['MANAGER', 'MIXING_OFFICER', 'SYSTEM_ADMIN'].includes(user?.role ?? '') ? (
            <Link to="/batches/new" className="btn-primary"><Plus size={18} /> Create batch</Link>
          ) : undefined
        }
      />

      <div className="card mb-5 flex flex-col items-stretch gap-4 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 text-slate-400" size={18} />
          <input
            className="field pl-11"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search batch, recipe, compound, or officer…"
          />
        </div>
        <select className="field w-full sm:w-64" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="ALL">All statuses</option>
          {[...new Set(batches.map((batch) => batch.status))].map((value) => (
            <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
          ))}
        </select>
      </div>

      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {filtered.length === 0 ? (
        <EmptyState title="No batches found" message="Adjust the filters or create the first production batch." />
      ) : (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Batch</th>
                <th>Recipe revision</th>
                <th>Officer / Machine</th>
                <th>Quantity</th>
                <th>Production schedule</th>
                <th>Created</th>
                <th>Status</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((batch) => (
                <tr key={batch.id} className="transition hover:bg-slate-50">
                  <td>
                    <p className="font-black text-ink">{batch.factoryReference}</p>
                    <p className="mt-1 text-xs text-slate-500">{batch.compoundName} · Batch {batch.batchNumber}</p>
                  </td>
                  <td>
                    <p className="font-bold">{batch.recipeCode}</p>
                    <p className="mt-1 text-xs text-slate-500">Revision {batch.revisionNumber}</p>
                  </td>
                  <td>
                    <p>{batch.assignedOfficer.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">{batch.machine}</p>
                  </td>
                  <td>
                    <p className="font-bold">{batch.plannedQuantityKg} kg</p>
                    <p className="mt-1 text-xs text-slate-500">Actual: {batch.actualOutputQuantityKg ?? '—'}</p>
                  </td>
                  <td>
                    {batch.plannedStartTime ? (
                      <>
                        <p className="whitespace-nowrap text-sm font-bold">{formatDateTime(batch.plannedStartTime)}</p>
                        <div className="mt-1"><StatusBadge status={batch.scheduleTimingStatus} /></div>
                      </>
                    ) : <span className="text-sm text-slate-400">Not scheduled</span>}
                  </td>
                  <td className="whitespace-nowrap">{formatDateTime(batch.createdAt)}</td>
                  <td>
                    <StatusBadge status={batch.status} />
                    {batch.temporaryLabBypass && <div className="mt-2"><StatusBadge status="TEMPORARY_LAB_BYPASS" /></div>}
                  </td>
                  <td>
                    <Link to={`/batches/${batch.id}`} className="grid h-10 w-10 place-items-center rounded-xl text-process hover:bg-blue-50" aria-label={`Open ${batch.batchNumber}`}>
                      <ArrowRight size={18} />
                    </Link>
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
