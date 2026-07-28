import { useEffect, useMemo, useState } from 'react'
import { Search, ShieldCheck } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { api, displayError, formatDateTime, humanize } from '../lib/api'
import type { Audit } from '../types'

export function AuditPage() {
  const [records, setRecords] = useState<Audit[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api<Audit[]>('/api/audit?limit=200').then(setRecords).catch((reason) => setError(displayError(reason)))
  }, [])

  const filtered = useMemo(() => records.filter((record) =>
    `${record.action} ${record.entityType} ${record.actor?.fullName} ${record.newValue}`
      .toLowerCase().includes(query.toLowerCase()),
  ), [records, query])

  return (
    <div>
      <PageHeader eyebrow="Data reliability" title="Audit history" description="Append-only history of important changes, actors, timestamps, and related production records." />
      <div className="card mb-5 p-4"><div className="relative max-w-xl"><Search className="absolute left-3.5 top-3 text-slate-400" size={18} /><input className="field pl-11" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search action, record type, user, or value…" /></div></div>
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <div className="table-shell">
        <table>
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Record</th><th>Previous value</th><th>New value</th><th>References</th></tr></thead>
          <tbody>
            {filtered.map((record) => (
              <tr key={record.id}>
                <td className="whitespace-nowrap">{formatDateTime(record.actionTime)}</td>
                <td><div className="flex items-center gap-2"><ShieldCheck size={16} className="text-slate-400" /><span className="font-semibold">{record.actor?.fullName ?? 'System'}</span></div></td>
                <td className="font-bold text-ink">{humanize(record.action)}</td>
                <td>{record.entityType}{record.entityId ? ` #${record.entityId}` : ''}</td>
                <td className="max-w-xs text-xs text-slate-500">{record.previousValue ?? '—'}</td>
                <td className="max-w-xs text-xs text-slate-700">{record.newValue ?? '—'}</td>
                <td className="text-xs text-slate-500">{record.relatedBatchId ? `Batch #${record.relatedBatchId}` : ''}{record.relatedBatchId && record.relatedRecipeId ? ' · ' : ''}{record.relatedRecipeId ? `Recipe #${record.relatedRecipeId}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
