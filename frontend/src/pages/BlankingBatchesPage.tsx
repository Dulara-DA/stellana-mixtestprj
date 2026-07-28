import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, Factory, Play, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime } from '../lib/api'
import type { ApprovedMaterialBatch, BlankingBatch } from '../types'

const TOPICS = ['/topic/blanking'] as const
const initialForm = {
  batchNumber: '',
  approvedMaterialBatchId: '',
  materialConsumedKg: '',
  plannedProductionQuantity: '',
  notes: '',
  startImmediately: false,
}

export function BlankingBatchesPage() {
  const { user } = useAuth()
  const canOperate = ['BLANKING_OPERATOR', 'BLANKING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const [materials, setMaterials] = useState<ApprovedMaterialBatch[]>([])
  const [batches, setBatches] = useState<BlankingBatch[]>([])
  const [form, setForm] = useState(initialForm)
  const [completion, setCompletion] = useState({ id: 0, productionQuantity: '', rejectedQuantity: '0', notes: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [materialData, batchData] = await Promise.all([
        api<ApprovedMaterialBatch[]>('/api/blanking/approved-materials'),
        api<BlankingBatch[]>('/api/blanking/batches'),
      ])
      setMaterials(materialData)
      setBatches(batchData)
      setError('')
    } catch (reason) { setError(displayError(reason)) }
  }, [])
  const connected = useRealtimeRefresh(load, TOPICS)
  const selectedMaterial = useMemo(
    () => materials.find((item) => item.id === Number(form.approvedMaterialBatchId)),
    [form.approvedMaterialBatchId, materials],
  )

  const create = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/blanking/batches', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          approvedMaterialBatchId: Number(form.approvedMaterialBatchId),
          materialConsumedKg: Number(form.materialConsumedKg),
          plannedProductionQuantity: Number(form.plannedProductionQuantity),
        }),
      })
      setForm(initialForm)
      setMessage('Blanking batch created with official date, shift and operator identity.')
      await load()
    } catch (reason) { setError(displayError(reason)) } finally { setBusy(false) }
  }

  const start = async (id: number) => {
    if (!window.confirm('Record the official IN time and start this blanking batch now?')) return
    try {
      await api(`/api/blanking/batches/${id}/start`, { method: 'POST' })
      setMessage('Blanking batch started.')
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const complete = async (event: FormEvent) => {
    event.preventDefault()
    if (!window.confirm('Complete this batch and record the official OUT time?')) return
    try {
      await api(`/api/blanking/batches/${completion.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          productionQuantity: Number(completion.productionQuantity),
          rejectedQuantity: Number(completion.rejectedQuantity),
          notes: completion.notes,
        }),
      })
      setCompletion({ id: 0, productionQuantity: '', rejectedQuantity: '0', notes: '' })
      setMessage('Output, rejection and OUT time recorded.')
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Blank production"
        title="Blanking batches"
        description="Consume only lab-approved material. Material kg and produced blank counts are intentionally separate units."
        actions={<LiveIndicator connected={connected} />}
      />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

      {canOperate && (
        <form onSubmit={create} className="card mb-7 p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-process"><Plus size={21} /></div><div><h2 className="font-black text-ink">Create blanking batch</h2><p className="text-xs text-slate-500">Production date, shift, employee ID and creation time come from the server.</p></div></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <label><span className="label">Blanking batch no.</span><input className="field" required value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} placeholder="BLK-2026-001" /></label>
            <label className="xl:col-span-2"><span className="label">Approved Mixing batch</span><select className="field" required value={form.approvedMaterialBatchId} onChange={(e) => setForm({ ...form, approvedMaterialBatchId: e.target.value })}><option value="">Select PASS material</option>{materials.filter((item) => item.active && item.availableQuantityKg > 0).map((item) => <option key={item.id} value={item.id}>{item.mixingBatchNumber} · {item.materialCode} · {item.availableQuantityKg} kg</option>)}</select></label>
            <label><span className="label">Material used (kg)</span><input className="field" required min="0.001" step="0.001" type="number" max={selectedMaterial?.availableQuantityKg} value={form.materialConsumedKg} onChange={(e) => setForm({ ...form, materialConsumedKg: e.target.value })} /></label>
            <label><span className="label">Planned blanks</span><input className="field" required min="1" type="number" value={form.plannedProductionQuantity} onChange={(e) => setForm({ ...form, plannedProductionQuantity: e.target.value })} /></label>
            <label><span className="label">Operator</span><input className="field bg-slate-50" value={`${user?.fullName} · ${user?.employeeId ?? 'ID TBC'}`} disabled /></label>
            <label className="md:col-span-2 xl:col-span-5"><span className="label">Notes (optional)</span><input className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3"><input type="checkbox" checked={form.startImmediately} onChange={(e) => setForm({ ...form, startImmediately: e.target.checked })} /><span className="text-sm font-bold">Record IN now</span></label>
          </div>
          <div className="mt-5 flex justify-end"><button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create batch'}</button></div>
        </form>
      )}

      {batches.length === 0 ? <EmptyState title="No blanking batches" message="Create the first batch from a passed, released Mixing material batch." /> : (
        <div className="table-shell">
          <table>
            <thead><tr><th>Batch / source</th><th>Official shift</th><th>Quantities</th><th>IN / OUT</th><th>Operator</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{batches.map((batch) => (
              <tr key={batch.id}>
                <td><p className="font-black text-ink">{batch.batchNumber}</p><p className="mt-1 text-xs">{batch.mixingBatchNumber} · {batch.materialCode}</p></td>
                <td>{batch.productionDate}<p className="text-xs text-slate-500">{batch.shift.replace('_', ' ')}</p></td>
                <td>{batch.materialConsumedKg} kg<p className="text-xs text-slate-500">{batch.productionQuantity ?? 0}/{batch.plannedProductionQuantity} blanks · {batch.rejectedQuantity} rejected</p></td>
                <td>{formatDateTime(batch.startTime)}<p className="mt-1 text-xs text-slate-500">{formatDateTime(batch.endTime)}</p></td>
                <td>{batch.operator.fullName}<p className="text-xs text-slate-500">{batch.operatorEmployeeId}</p></td>
                <td><StatusBadge status={batch.status} /></td>
                <td>
                  {canOperate && batch.status === 'PLANNED' && <button className="btn-primary" onClick={() => start(batch.id)}><Play size={16} /> Record IN</button>}
                  {canOperate && batch.status === 'IN_PROGRESS' && <button className="btn-primary" onClick={() => setCompletion({ id: batch.id, productionQuantity: String(batch.plannedProductionQuantity), rejectedQuantity: '0', notes: '' })}><CheckCircle2 size={16} /> Complete</button>}
                  {!['PLANNED', 'IN_PROGRESS'].includes(batch.status) && <span className="text-xs text-slate-400">Recorded</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {completion.id > 0 && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4">
          <form onSubmit={complete} className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center gap-3"><Factory className="text-process" /><div><h2 className="text-xl font-black">Complete blanking batch</h2><p className="text-sm text-slate-500">Good available blanks = production − rejected.</p></div></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="label">Total production quantity</span><input className="field" required min="1" type="number" value={completion.productionQuantity} onChange={(e) => setCompletion({ ...completion, productionQuantity: e.target.value })} /></label>
              <label><span className="label">Rejected blanks</span><input className="field" required min="0" max={completion.productionQuantity} type="number" value={completion.rejectedQuantity} onChange={(e) => setCompletion({ ...completion, rejectedQuantity: e.target.value })} /></label>
              <label className="sm:col-span-2"><span className="label">Completion note</span><textarea className="field min-h-24" value={completion.notes} onChange={(e) => setCompletion({ ...completion, notes: e.target.value })} /></label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setCompletion({ id: 0, productionQuantity: '', rejectedQuantity: '0', notes: '' })}>Cancel</button><button className="btn-primary">Record OUT & complete</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
