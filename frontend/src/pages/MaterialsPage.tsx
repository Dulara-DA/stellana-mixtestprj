import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, PackagePlus, Send, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { api, displayError, formatDateTime } from '../lib/api'
import type { Batch, MaterialRequest } from '../types'

export function MaterialsPage() {
  const { user } = useAuth()
  const [requests, setRequests] = useState<MaterialRequest[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<MaterialRequest | null>(null)
  const [batchId, setBatchId] = useState('')
  const [notes, setNotes] = useState('')
  const [issueValues, setIssueValues] = useState<Record<number, { quantity: string; lot: string }>>({})
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [requestData, batchData] = await Promise.all([
        api<MaterialRequest[]>('/api/material-requests'),
        api<Batch[]>('/api/batches'),
      ])
      setRequests(requestData)
      setBatches(batchData)
      setError('')
    } catch (reason) {
      setError(displayError(reason))
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await api('/api/material-requests', {
        method: 'POST',
        body: JSON.stringify({ batchId: Number(batchId), notes, items: [] }),
      })
      setShowCreate(false)
      setBatchId('')
      setNotes('')
      await load()
    } catch (reason) {
      setError(displayError(reason))
    }
  }

  const openIssue = (request: MaterialRequest) => {
    setSelected(request)
    setIssueValues(Object.fromEntries(request.items.map((item) => [
      item.id,
      { quantity: String(item.requestedQuantity), lot: item.rawMaterialLotNumber ?? '' },
    ])))
  }

  const issue = async () => {
    if (!selected) return
    if (!window.confirm(`Confirm material issue for ${selected.requestNumber}?`)) return
    try {
      await api(`/api/material-requests/${selected.id}/issue`, {
        method: 'POST',
        body: JSON.stringify({
          items: selected.items.map((item) => ({
            itemId: item.id,
            issuedQuantity: Number(issueValues[item.id]?.quantity ?? 0),
            rawMaterialLotNumber: issueValues[item.id]?.lot || null,
          })),
          notes: 'Issued through prototype stores control.',
        }),
      })
      setSelected(null)
      await load()
    } catch (reason) {
      setError(displayError(reason))
    }
  }

  const eligible = batches.filter((batch) => ['PLANNED', 'WAITING_FOR_MATERIALS'].includes(batch.status))
  const canIssue = ['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')

  return (
    <div>
      <PageHeader
        eyebrow="Stores coordination"
        title="Raw-material requests"
        description="Requests preserve the batch and recipe revision context, requested quantities, issued quantities, and optional lot references."
        actions={<button className="btn-primary" onClick={() => setShowCreate(true)}><PackagePlus size={18} /> Request materials</button>}
      />
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {requests.length === 0 ? (
        <EmptyState title="No material requests" message="Create a request from a planned or waiting batch." />
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <section key={request.id} className="card overflow-x-auto">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div className="flex items-center gap-4">
                  <div><p className="font-black text-ink">{request.requestNumber}</p><p className="mt-1 text-xs text-slate-500">{request.batchNumber} · {request.recipeCode} rev {request.revisionNumber}</p></div>
                  <StatusBadge status={request.status} />
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-right text-xs leading-5 text-slate-500">Requested {formatDateTime(request.requestedAt)}<br />by {request.requestingOfficer.fullName}</p>
                  {canIssue && ['REQUESTED', 'PARTIALLY_ISSUED'].includes(request.status) && (
                    <button className="btn-primary" onClick={() => openIssue(request)}><CheckCircle2 size={17} /> Record issue</button>
                  )}
                </div>
              </div>
              <div className="grid min-w-[760px] grid-cols-[1.2fr_0.55fr_0.55fr_0.55fr_0.85fr] bg-slate-50 px-6 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                <span>Material</span><span>Required</span><span>Requested</span><span>Issued</span><span>Lot number</span>
              </div>
              {request.items.map((item) => (
                <div key={item.id} className="grid min-w-[760px] grid-cols-[1.2fr_0.55fr_0.55fr_0.55fr_0.85fr] items-center border-t border-slate-100 px-6 py-3 text-sm">
                  <span><strong className="text-ink">{item.materialName}</strong><small className="ml-2 text-slate-400">{item.materialCode}</small></span>
                  <span>{item.requiredQuantity} {item.unit}</span>
                  <span>{item.requestedQuantity} {item.unit}</span>
                  <span className={item.issuedQuantity >= item.requestedQuantity ? 'font-bold text-emerald-700' : ''}>{item.issuedQuantity} {item.unit}</span>
                  <span>{item.rawMaterialLotNumber ?? '—'}</span>
                </div>
              ))}
              {request.notes && <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">Note: {request.notes}</p>}
            </section>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-8 backdrop-blur-sm">
          <form onSubmit={create} className="w-full max-w-xl rounded-2xl bg-white p-7 shadow-2xl">
            <div className="mb-6 flex items-start justify-between">
              <div><h2 className="text-xl font-black text-ink">Request raw materials</h2><p className="mt-1 text-sm text-slate-500">Recipe ingredients will be loaded automatically.</p></div>
              <button type="button" onClick={() => setShowCreate(false)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100" aria-label="Close"><X size={19} /></button>
            </div>
            <label><span className="label">Batch</span><select className="field" required value={batchId} onChange={(event) => setBatchId(event.target.value)}><option value="">Select eligible batch</option>{eligible.map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNumber} · {batch.recipeCode} rev {batch.revisionNumber}</option>)}</select></label>
            <label className="mt-5 block"><span className="label">Notes</span><textarea className="field min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional instruction to stores" /></label>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button><button className="btn-primary" type="submit"><Send size={17} /> Submit request</button></div>
          </form>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-8 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-7 shadow-2xl">
            <div className="mb-6 flex items-start justify-between">
              <div><h2 className="text-xl font-black text-ink">Record stores issue</h2><p className="mt-1 text-sm text-slate-500">{selected.requestNumber} · {selected.batchNumber}</p></div>
              <button onClick={() => setSelected(null)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100" aria-label="Close"><X size={19} /></button>
            </div>
            <div className="space-y-3">
              {selected.items.map((item) => (
                <div key={item.id} className="grid items-end gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-[1.2fr_0.6fr_0.9fr]">
                  <div><p className="font-bold text-ink">{item.materialName}</p><p className="mt-1 text-xs text-slate-500">{item.materialCode} · Requested {item.requestedQuantity} {item.unit}</p></div>
                  <label><span className="label">Issued ({item.unit})</span><input className="field" type="number" min="0" max={item.requestedQuantity} step="0.001" value={issueValues[item.id]?.quantity ?? ''} onChange={(event) => setIssueValues({ ...issueValues, [item.id]: { ...issueValues[item.id], quantity: event.target.value } })} /></label>
                  <label><span className="label">Lot number (optional)</span><input className="field" value={issueValues[item.id]?.lot ?? ''} onChange={(event) => setIssueValues({ ...issueValues, [item.id]: { ...issueValues[item.id], lot: event.target.value } })} /></label>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-3"><button className="btn-secondary" onClick={() => setSelected(null)}>Cancel</button><button className="btn-primary" onClick={issue}><CheckCircle2 size={17} /> Confirm issued quantities</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
