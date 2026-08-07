import { useCallback, useState, type FormEvent } from 'react'
import { CheckCircle2, Factory, Play, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime } from '../lib/api'
import type { BlankingBatch, OperatorOption } from '../types'

const TOPICS = ['/topic/blanking'] as const

const initialForm = {
  batchNumber: '',
  materialCode: '',
  materialConsumedKg: '',
  itemCode: '',
  millOperator: '',
  preformerOperator: '',
  notes: '',
  startImmediately: false,
}

const emptyCompletion = {
  id: 0,
  actualGoodBlankQuantity: '',
  rejectedQuantity: '0',
  rejectedMaterialWeightKg: '0',
  measuredRemainingCompoundWeightKg: '',
  supervisorConfirmation: false,
  balanceConfirmationReason: '',
  notes: '',
}

export function BlankingBatchesPage() {
  const { user } = useAuth()
  const canOperate = ['BLANKING_OPERATOR', 'BLANKING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const [batches, setBatches] = useState<BlankingBatch[]>([])
  const [operatorOptions, setOperatorOptions] = useState<OperatorOption[]>([])
  const [form, setForm] = useState(initialForm)
  const [completion, setCompletion] = useState(emptyCompletion)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [batchValues, operatorValues] = await Promise.all([
        api<BlankingBatch[]>('/api/blanking/batches'),
        api<OperatorOption[]>('/api/users/blanking-operators'),
      ])
      setBatches(batchValues)
      setOperatorOptions(operatorValues)
      setError('')
    } catch (reason) { setError(displayError(reason)) }
  }, [])
  const connected = useRealtimeRefresh(load, TOPICS)
  const create = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/blanking/batches', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          mixingBatchNumber: form.batchNumber,
          materialConsumedKg: Number(form.materialConsumedKg),
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
          actualGoodBlankQuantity: Number(completion.actualGoodBlankQuantity),
          productionQuantity: Number(completion.actualGoodBlankQuantity) + Number(completion.rejectedQuantity),
          rejectedQuantity: Number(completion.rejectedQuantity),
          rejectedMaterialWeightKg: Number(completion.rejectedMaterialWeightKg),
          measuredRemainingCompoundWeightKg: completion.measuredRemainingCompoundWeightKg
            ? Number(completion.measuredRemainingCompoundWeightKg) : null,
          supervisorConfirmation: completion.supervisorConfirmation,
          balanceConfirmationReason: completion.balanceConfirmationReason,
          notes: completion.notes,
        }),
      })
      setCompletion(emptyCompletion)
      setMessage('Output, rejection and OUT time recorded.')
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Blank production"
        title="Blanking batches"
        description="Temporary manual Mixing-batch entry is enabled until the laboratory approval workflow is introduced. Actual blank quantities are recorded when production is completed."
        actions={<LiveIndicator connected={connected} />}
      />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

      {canOperate && (
        <form onSubmit={create} className="card mb-7 p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-process"><Plus size={21} /></div><div><h2 className="font-black text-ink">Create blanking batch</h2><p className="text-xs text-slate-500">Production date, shift, employee ID and creation time come from the server.</p></div></div>
          <p className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Temporary prototype mode: enter the physical Batch No. and compound code manually.
            Laboratory approval will be connected later.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <label><span className="label">Batch No.</span><input className="field" required value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} placeholder="6160" /></label>
            <label><span className="label">Compound / material code</span><input className="field" required value={form.materialCode} onChange={(e) => setForm({ ...form, materialCode: e.target.value })} placeholder="A-96-50" /></label>
            <label><span className="label">Compound issued (kg)</span><input className="field" required min="0.001" step="0.001" type="number" value={form.materialConsumedKg} onChange={(e) => setForm({ ...form, materialConsumedKg: e.target.value })} /></label>
            <label><span className="label">Operator</span><input className="field bg-slate-50" value={`${user?.fullName} · ${user?.employeeId ?? 'ID TBC'}`} disabled /></label>
            <label><span className="label">Item code</span><input className="field" required value={form.itemCode} onChange={(e) => setForm({ ...form, itemCode: e.target.value })} placeholder="UG 200×50" /></label>
            <label><span className="label">Mill operator</span><input className="field" list="blanking-operator-options" required value={form.millOperator} onChange={(e) => setForm({ ...form, millOperator: e.target.value })} placeholder="Select EMP.NO - Name" autoComplete="off" /><span className="mt-1 block text-xs text-slate-500">Select an entered employee or type a name.</span></label>
            <label><span className="label">Preformer operator</span><input className="field" list="blanking-operator-options" required value={form.preformerOperator} onChange={(e) => setForm({ ...form, preformerOperator: e.target.value })} placeholder="Select EMP.NO - Name" autoComplete="off" /><span className="mt-1 block text-xs text-slate-500">Select an entered employee or type a name.</span></label>
            <datalist id="blanking-operator-options">
              {operatorOptions.map((operator) => (
                <option key={operator.employeeId} value={`${operator.employeeId} - ${operator.fullName}`} />
              ))}
            </datalist>
            <label className="md:col-span-2"><span className="label">Notes (optional)</span><input className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3"><input type="checkbox" checked={form.startImmediately} onChange={(e) => setForm({ ...form, startImmediately: e.target.checked })} /><span className="text-sm font-bold">Record IN now</span></label>
          </div>
          <div className="mt-5 flex justify-end"><button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create batch'}</button></div>
        </form>
      )}

      {batches.length === 0 ? <EmptyState title="No blanking batches" message="Create the first batch from a passed, released Mixing material batch." /> : (
        <div className="table-shell">
          <table>
            <thead><tr><th>Batch No. / compound</th><th>Official shift</th><th>Quantities</th><th>IN / OUT</th><th>Operator</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{batches.map((batch) => (
              <tr key={batch.id}>
                <td><p className="font-black text-ink">{batch.batchNumber}</p><p className="mt-1 text-xs">{batch.materialCode}</p></td>
                <td>{batch.productionDate}<p className="text-xs text-slate-500">{batch.shift.replace('_', ' ')}</p></td>
                <td>{batch.materialConsumedKg} kg<p className="text-xs text-slate-500">{batch.actualGoodBlankQuantity ?? 0} good blanks · {batch.rejectedQuantity} rejected</p><p className="text-xs text-slate-500">{batch.actualUsedCompoundWeightKg} kg used · {batch.remainingCompoundWeightKg} kg remaining</p></td>
                <td>{formatDateTime(batch.startTime)}<p className="mt-1 text-xs text-slate-500">{formatDateTime(batch.endTime)}</p></td>
                <td>{batch.operator.fullName}<p className="text-xs text-slate-500">{batch.operatorEmployeeId}</p></td>
                <td><StatusBadge status={batch.status} /></td>
                <td>
                  {canOperate && batch.status === 'PLANNED' && <button className="btn-primary" onClick={() => start(batch.id)}><Play size={16} /> Record IN</button>}
                  {canOperate && batch.status === 'IN_PROGRESS' && <button className="btn-primary" onClick={() => setCompletion({ ...emptyCompletion, id: batch.id })}><CheckCircle2 size={16} /> Complete</button>}
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
            <div className="mb-5 flex items-center gap-3"><Factory className="text-process" /><div><h2 className="text-xl font-black">Complete blanking batch</h2><p className="text-sm text-slate-500">The backend validates piece and compound-weight balances again.</p></div></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="label">Actual good blanks (pieces)</span><input className="field" required min="0" type="number" value={completion.actualGoodBlankQuantity} onChange={(e) => setCompletion({ ...completion, actualGoodBlankQuantity: e.target.value })} /></label>
              <label><span className="label">Rejected blanks (pieces)</span><input className="field" required min="0" type="number" value={completion.rejectedQuantity} onChange={(e) => setCompletion({ ...completion, rejectedQuantity: e.target.value })} /></label>
              <label><span className="label">Rejected material weight (kg)</span><input className="field" required min="0" step="0.001" type="number" value={completion.rejectedMaterialWeightKg} onChange={(e) => setCompletion({ ...completion, rejectedMaterialWeightKg: e.target.value })} /></label>
              <label><span className="label">Measured remaining compound (kg)</span><input className="field" min="0" step="0.001" type="number" value={completion.measuredRemainingCompoundWeightKg} onChange={(e) => setCompletion({ ...completion, measuredRemainingCompoundWeightKg: e.target.value })} placeholder="Leave empty to use calculated balance" /></label>
              <label className="sm:col-span-2"><span className="label">Completion note</span><textarea className="field min-h-24" value={completion.notes} onChange={(e) => setCompletion({ ...completion, notes: e.target.value })} /></label>
              {['BLANKING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '') && <label className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><input type="checkbox" checked={completion.supervisorConfirmation} onChange={(e) => setCompletion({ ...completion, supervisorConfirmation: e.target.checked })} /><span className="text-sm font-bold text-amber-900">Authorize a measured balance variance</span></label>}
              {completion.supervisorConfirmation && <label className="sm:col-span-2"><span className="label">Required balance confirmation reason</span><textarea className="field min-h-20" required value={completion.balanceConfirmationReason} onChange={(e) => setCompletion({ ...completion, balanceConfirmationReason: e.target.value })} /></label>}
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setCompletion(emptyCompletion)}>Cancel</button><button className="btn-primary">Record OUT & complete</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
