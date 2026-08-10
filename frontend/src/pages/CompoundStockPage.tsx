import type { FormEvent } from 'react'
import { useCallback, useState } from 'react'
import { Boxes, Calculator, FlaskConical, PackageCheck, Scale } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime } from '../lib/api'
import type { ApprovedMaterialBatch, BlankingBatch } from '../types'

const TOPICS = ['/topic/blanking', '/topic/production'] as const
const emptyReceiptUpdate = { id: 0, mixingBatchNumber: '', materialCode: '', currentReceived: 0, currentAvailable: 0, receivedQuantityKg: '', reason: '' }

export function CompoundStockPage() {
  const { user } = useAuth()
  const canControl = ['BLANKING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canUpdateReceipt = user?.role === 'SYSTEM_ADMIN'
  const [stock, setStock] = useState<ApprovedMaterialBatch[]>([])
  const [blankingBatches, setBlankingBatches] = useState<BlankingBatch[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savingReceipt, setSavingReceipt] = useState(false)
  const [receiptUpdate, setReceiptUpdate] = useState(emptyReceiptUpdate)

  const load = useCallback(async () => {
    try {
      const [stockValues, batchValues] = await Promise.all([
        api<ApprovedMaterialBatch[]>('/api/blanking/compound-stock'),
        api<BlankingBatch[]>('/api/blanking/batches'),
      ])
      setStock(stockValues)
      setBlankingBatches(batchValues)
      setError('')
    } catch (reason) {
      setError(displayError(reason))
    }
  }, [])
  const connected = useRealtimeRefresh(load, TOPICS)
  const totals = stock.reduce((value, item) => ({
    received: value.received + Number(item.receivedQuantityKg),
    available: value.available + Number(item.availableQuantityKg),
    reserved: value.reserved + Number(item.reservedQuantityKg),
    consumed: value.consumed + Number(item.consumedQuantityKg),
  }), { received: 0, available: 0, reserved: 0, consumed: 0 })
  const kpis = [
    { label: 'Received', value: totals.received, Icon: FlaskConical, tone: 'bg-blue-100 text-process' },
    { label: 'Available', value: totals.available, Icon: Boxes, tone: 'bg-emerald-100 text-emerald-700' },
    { label: 'Reserved', value: totals.reserved, Icon: Scale, tone: 'bg-amber-100 text-amber-700' },
    { label: 'Consumed', value: totals.consumed, Icon: Scale, tone: 'bg-slate-200 text-slate-700' },
  ]
  const currentBlankingEstimates = blankingBatches
    .filter((batch) => batch.status === 'IN_PROGRESS')
    .map((batch) => {
      const issuedKg = Number(batch.materialConsumedKg)
      const averageGrams = Number(batch.averageBlankWeightGrams ?? 0)
      const exactBlanks = Number(batch.expectedBlankQuantity
        ?? (averageGrams > 0 ? (issuedKg * 1000) / averageGrams : batch.plannedProductionQuantity))
      return {
        batch,
        issuedKg,
        averageGrams,
        exactBlanks,
        wholeBlanks: batch.expectedWholeBlankQuantity ?? Math.floor(exactBlanks),
      }
    })
  const currentBlankingTotals = currentBlankingEstimates.reduce((total, item) => ({
    issuedKg: total.issuedKg + item.issuedKg,
    exactBlanks: total.exactBlanks + item.exactBlanks,
    wholeBlanks: total.wholeBlanks + item.wholeBlanks,
  }), { issuedKg: 0, exactBlanks: 0, wholeBlanks: 0 })
  const changeStatus = async (item: ApprovedMaterialBatch, status: 'AVAILABLE' | 'ON_HOLD' | 'REJECTED') => {
    if (status === item.stockStatus || (status === 'AVAILABLE' && item.stockStatus === 'PARTIALLY_USED')) return
    const reason = window.prompt(`Reason for changing ${item.mixingBatchNumber} to ${status.replace('_', ' ')}:`)
    if (!reason?.trim()) return
    try {
      await api(`/api/blanking/compound-stock/${item.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      })
      await load()
    } catch (value) {
      setError(displayError(value))
    }
  }

  const openReceiptUpdate = (item: ApprovedMaterialBatch) => {
    setError('')
    setMessage('')
    setReceiptUpdate({
      id: item.id,
      mixingBatchNumber: item.mixingBatchNumber,
      materialCode: item.materialCode,
      currentReceived: Number(item.receivedQuantityKg),
      currentAvailable: Number(item.availableQuantityKg),
      receivedQuantityKg: String(item.receivedQuantityKg),
      reason: '',
    })
  }

  const updateReceipt = async (event: FormEvent) => {
    event.preventDefault()
    setSavingReceipt(true)
    setError('')
    setMessage('')
    try {
      await api(`/api/blanking/compound-stock/${receiptUpdate.id}/receipt`, {
        method: 'PATCH',
        body: JSON.stringify({
          receivedQuantityKg: Number(receiptUpdate.receivedQuantityKg),
          reason: receiptUpdate.reason.trim(),
        }),
      })
      setMessage(`${receiptUpdate.mixingBatchNumber} receipt was updated successfully.`)
      setReceiptUpdate(emptyReceiptUpdate)
      await load()
    } catch (value) {
      setError(displayError(value))
    } finally {
      setSavingReceipt(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Released compound"
        title="Compound stock"
        description="Laboratory-PASS batches and explicitly authorized temporary lab-bypass releases appear here. Quantities are in kilograms."
        actions={<LiveIndicator connected={connected} />}
      />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, Icon, tone }) => (
          <div key={label} className="card p-4">
            <div className={`mb-3 grid h-10 w-10 place-items-center rounded-xl ${tone}`}><Icon size={19} /></div>
            <p className="text-2xl font-black">{value.toFixed(3)} <span className="text-sm text-slate-500">kg</span></p>
            <p className="text-xs font-bold text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <section className="card mb-6 overflow-hidden border-l-4 border-l-process" aria-labelledby="current-blanking-estimate-title">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-blue-50/60 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-100 text-process"><Calculator size={21} /></div>
            <div>
              <h2 id="current-blanking-estimate-title" className="font-black text-ink">Compound stock → Current Blanking details (estimated)</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Calculated only for batches currently IN progress. Estimated blanks = (issued compound kg × 1000) ÷ average blank weight in grams.</p>
            </div>
          </div>
          <StatusBadge status={currentBlankingEstimates.length > 0 ? 'IN_PROGRESS' : 'IDLE'} />
        </div>

        {currentBlankingEstimates.length === 0 ? (
          <p className="px-5 py-5 text-sm text-slate-500 sm:px-6">No Blanking batch is currently in progress, so there is no active estimate.</p>
        ) : (
          <>
            <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
              <div className="bg-white p-4 sm:px-6"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Current batches</p><p className="mt-1 text-2xl font-black text-ink">{currentBlankingEstimates.length}</p></div>
              <div className="bg-white p-4 sm:px-6"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Compound issued</p><p className="mt-1 text-2xl font-black text-process">{currentBlankingTotals.issuedKg.toFixed(3)} <span className="text-sm text-slate-500">kg</span></p></div>
              <div className="bg-white p-4 sm:px-6"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Estimated whole blanks</p><p className="mt-1 text-2xl font-black text-emerald-700">{currentBlankingTotals.wholeBlanks.toLocaleString()} <span className="text-sm text-slate-500">pieces</span></p><p className="text-xs text-slate-400">Exact estimate: {currentBlankingTotals.exactBlanks.toFixed(3)}</p></div>
            </div>
            <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2">
              {currentBlankingEstimates.map(({ batch, issuedKg, averageGrams, exactBlanks, wholeBlanks }) => (
                <div key={batch.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black text-ink">Batch No. {batch.batchNumber}</p><p className="text-xs text-slate-500">{batch.materialCode}{batch.itemCode ? ` · ${batch.itemCode}` : ''}</p></div><StatusBadge status={batch.status} /></div>
                  {averageGrams > 0 ? (
                    <p className="mt-3 font-mono text-sm font-bold text-slate-700">({issuedKg.toFixed(3)} kg × 1000) ÷ {averageGrams.toFixed(3)} g = {exactBlanks.toFixed(3)}</p>
                  ) : (
                    <p className="mt-3 text-sm font-bold text-amber-800">Average blank weight is unavailable. Planned production is shown as the temporary estimate.</p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">Estimated output: <span className="font-black text-emerald-700">{wholeBlanks.toLocaleString()} whole blanks</span>. Fractional output is not rounded up.</p>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs font-medium text-amber-900 sm:px-6">Estimate only—this does not change compound stock or replace the actual good and rejected quantities recorded when the Blanking batch is completed.</p>
      </section>

      {stock.length === 0 ? <EmptyState title="No released compound stock" message="A Mixing batch appears after a laboratory PASS or an authorized temporary lab-bypass release to Blanking." /> : (
        <div className="table-shell">
          <table>
            <thead><tr><th>Compound / Mixing batch</th><th>Lab approval</th><th>Required / received</th><th>Available / reserved</th><th>Consumed / returned</th><th>Received by / time</th><th>Status</th>{canControl && <th>Controlled status</th>}{canUpdateReceipt && <th>Receipt entry</th>}</tr></thead>
            <tbody>{stock.map((item) => (
              <tr key={item.id}>
                <td><p className="font-black">{item.materialCode}</p><p className="text-xs text-slate-500">{item.mixingBatchNumber} · {item.compoundName}</p></td>
                <td>
                  {item.temporaryLabBypass ? <StatusBadge status="TEMPORARY_LAB_BYPASS" /> : <StatusBadge status={item.labStatus} />}
                  {item.temporaryLabBypass ? (
                    <>
                      <p className="mt-1 text-xs font-bold text-amber-800">Not a laboratory PASS</p>
                      <p className="mt-1 max-w-64 text-xs text-slate-500">{item.temporaryLabBypassApprovedBy?.fullName ?? 'Authorized management'} · {formatDateTime(item.temporaryLabBypassApprovedAt)}</p>
                      {item.temporaryLabBypassReason && <p className="mt-1 max-w-64 text-xs text-slate-600">{item.temporaryLabBypassReason}</p>}
                    </>
                  ) : <p className="mt-1 text-xs text-slate-500">Ref #{item.labApprovalId ?? 'TBC'}</p>}
                </td>
                <td>{item.plannedQuantityKg} kg<p className="text-xs text-slate-500">{item.receivedQuantityKg} kg received</p></td>
                <td><span className="font-black text-emerald-700">{item.availableQuantityKg} kg</span><p className="text-xs text-amber-700">{item.reservedQuantityKg} kg reserved</p></td>
                <td>{item.consumedQuantityKg} kg<p className="text-xs text-slate-500">{item.returnedQuantityKg} kg returned</p></td>
                <td>{item.stockStatus === 'AWAITING_RECEIPT' ? 'Awaiting receipt' : item.receivingOperator?.fullName ?? 'System release'}<p className="text-xs text-slate-500">{formatDateTime(item.receivedAt)}</p></td>
                <td><StatusBadge status={item.stockStatus} /></td>
                {canControl && <td><select className="field min-w-36" value={item.stockStatus === 'PARTIALLY_USED' ? 'AVAILABLE' : item.stockStatus} onChange={(event) => void changeStatus(item, event.target.value as 'AVAILABLE' | 'ON_HOLD' | 'REJECTED')}><option value="AVAILABLE">Available</option><option value="ON_HOLD">On hold</option><option value="REJECTED">Rejected</option>{item.stockStatus === 'DEPLETED' && <option value="DEPLETED" disabled>Depleted</option>}{item.stockStatus === 'AWAITING_RECEIPT' && <option value="AWAITING_RECEIPT" disabled>Awaiting receipt</option>}</select></td>}
                {canUpdateReceipt && <td><button type="button" className="btn-secondary whitespace-nowrap" onClick={() => openReceiptUpdate(item)}><PackageCheck size={16} /> {item.stockStatus === 'AWAITING_RECEIPT' ? 'Receive compound' : 'Update receipt'}</button></td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {canUpdateReceipt && receiptUpdate.id > 0 && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4 backdrop-blur-sm">
          <form onSubmit={updateReceipt} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-process"><PackageCheck size={21} /></div>
              <div><h2 className="text-xl font-black">Update compound receipt</h2><p className="text-sm text-slate-500">{receiptUpdate.materialCode} · Mixing batch {receiptUpdate.mixingBatchNumber}</p></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Current received</p><p className="mt-1 text-xl font-black">{receiptUpdate.currentReceived.toFixed(3)} kg</p></div>
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Current available</p><p className="mt-1 text-xl font-black text-emerald-700">{receiptUpdate.currentAvailable.toFixed(3)} kg</p></div>
              <label className="sm:col-span-2"><span className="label">Actual total received (kg)</span><input className="field" required min="0" step="0.001" type="number" value={receiptUpdate.receivedQuantityKg} onChange={(event) => setReceiptUpdate({ ...receiptUpdate, receivedQuantityKg: event.target.value })} /></label>
              <label className="sm:col-span-2"><span className="label">Reason for manual update</span><textarea className="field min-h-24" required maxLength={500} value={receiptUpdate.reason} onChange={(event) => setReceiptUpdate({ ...receiptUpdate, reason: event.target.value })} placeholder="For example: Physical scale receipt confirmed by stores." /></label>
            </div>
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">This changes the total received quantity and adjusts available stock by the same difference. The laboratory-approved quantity and already reserved or consumed stock are not changed.</p>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" disabled={savingReceipt} onClick={() => setReceiptUpdate(emptyReceiptUpdate)}>Cancel</button><button className="btn-primary" disabled={savingReceipt}>{savingReceipt ? 'Saving…' : 'Save receipt update'}</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
