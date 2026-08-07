import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, CircleDot, Pencil, Play } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime } from '../lib/api'
import type { BlankingCart, MouldingProductionRecord, Press } from '../types'

const TOPICS = ['/topic/moulding'] as const
const emptyCompletion = {
  id: 0,
  goodTyreQuantity: '',
  rejectedTyreQuantity: '0',
  rejectedTyreWeightPerItemGrams: '0',
  rejectedBlankQuantity: '0',
  downtimeMinutes: '0',
  downtimeReason: '',
  operatorNote: '',
}

export function MouldingProductionPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const requestedPressId = Number(searchParams.get('press'))
  const pressFilter = Number.isInteger(requestedPressId) && requestedPressId > 0 ? String(requestedPressId) : ''
  const canOperate = ['MOULDING_OPERATOR', 'MOULDING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canCompleteOtherOperators = ['MOULDING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canCorrect = ['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const [presses, setPresses] = useState<Press[]>([])
  const [carts, setCarts] = useState<BlankingCart[]>([])
  const [records, setRecords] = useState<MouldingProductionRecord[]>([])
  const [startForm, setStartForm] = useState({ pressId: pressFilter, cartId: '' })
  const [completion, setCompletion] = useState(emptyCompletion)
  const [correctionMode, setCorrectionMode] = useState(false)
  const [correctionReason, setCorrectionReason] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const [pressData, cartData, recordData] = await Promise.all([
        api<Press[]>('/api/moulding/presses'),
        api<BlankingCart[]>('/api/blanking/carts'),
        api<MouldingProductionRecord[]>('/api/moulding/records'),
      ])
      setPresses(pressData)
      setCarts(cartData)
      setRecords(recordData)
      setError('')
    } catch (reason) { setError(displayError(reason)) }
  }, [])
  const connected = useRealtimeRefresh(load, TOPICS)
  const selectedPress = presses.find((press) => press.id === requestedPressId)
  const visibleRecords = pressFilter
    ? records.filter((record) => record.pressId === requestedPressId)
    : records
  const usableCarts = carts.filter((cart) =>
    ['RECEIVED_AT_MOULDING', 'PARTIALLY_CONSUMED'].includes(cart.status)
      && cart.remainingQuantity > 0
      && (!pressFilter || cart.destinationPressId === requestedPressId))
  const selectedCart = useMemo(() => carts.find((cart) => cart.id === Number(startForm.cartId)), [carts, startForm.cartId])
  const activeRecord = records.find((record) => record.id === completion.id)
  const usedPreview = Number(completion.goodTyreQuantity || 0) + Number(completion.rejectedTyreQuantity || 0) + Number(completion.rejectedBlankQuantity || 0)
  const remainingPreview = Math.max(0, (activeRecord?.quantityReceived ?? 0) - usedPreview)

  const start = async (event: FormEvent) => {
    event.preventDefault()
    if (!window.confirm('Record the official start time and set this press to RUNNING?')) return
    try {
      await api('/api/moulding/records/start', {
        method: 'POST',
        body: JSON.stringify({ pressId: Number(startForm.pressId), cartId: Number(startForm.cartId) }),
      })
      setStartForm({ pressId: pressFilter, cartId: '' })
      setMessage('Moulding production record started.')
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const complete = async (event: FormEvent) => {
    event.preventDefault()
    const confirmation = correctionMode
      ? 'Correct this completed record and rebalance press/cart inventory? The old and new values will remain in the audit log.'
      : 'Complete this production record and update press and cart inventory?'
    if (!window.confirm(confirmation)) return
    try {
      await api(`/api/moulding/records/${completion.id}/${correctionMode ? 'correct' : 'complete'}`, {
        method: correctionMode ? 'PATCH' : 'POST',
        body: JSON.stringify({
          goodTyreQuantity: Number(completion.goodTyreQuantity),
          rejectedTyreQuantity: Number(completion.rejectedTyreQuantity),
          rejectedTyreWeightPerItemGrams: Number(completion.rejectedTyreWeightPerItemGrams),
          rejectedBlankQuantity: Number(completion.rejectedBlankQuantity),
          downtimeMinutes: Number(completion.downtimeMinutes),
          downtimeReason: completion.downtimeReason,
          operatorNote: completion.operatorNote,
          ...(correctionMode ? { correctionReason } : {}),
        }),
      })
      setCompletion(emptyCompletion)
      setCorrectionMode(false)
      setCorrectionReason('')
      setMessage(correctionMode ? 'Correction saved with old/new values and reason in the audit log.' : 'Production output recorded and inventory recalculated.')
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const canCompleteRecord = (record: MouldingProductionRecord) => canOperate
    && record.status === 'IN_PROGRESS'
    && (canCompleteOtherOperators || (user?.role === 'MOULDING_OPERATOR' && record.operator.id === user.id))

  return (
    <div>
      <PageHeader
        eyebrow="Press production"
        title="Press Production Entry Details"
        description={selectedPress ? `${selectedPress.pressNumber} · ${selectedPress.pressName}. Production values update its live press card after the entry is completed.` : 'One received blank produces one good tyre, one rejected tyre, or one rejected blank. Quantity validation is enforced again by the backend.'}
        actions={<div className="flex flex-wrap items-center gap-3">{selectedPress && <Link to="/moulding" className="btn-secondary"><ArrowLeft size={16} /> All presses</Link>}<LiveIndicator connected={connected} /></div>}
      />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

      {selectedPress && (
        <section className="card mb-7 p-5 sm:p-6" aria-label={`${selectedPress.pressNumber} live production totals`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-process">Selected press</p><h2 className="mt-1 text-xl font-black">{selectedPress.pressNumber} · {selectedPress.pressName}</h2><p className="mt-1 text-xs text-slate-500">Entry operator: {selectedPress.currentOperator?.fullName ?? 'Not assigned'} · Current batch: {selectedPress.currentBlankingBatchNumber ?? 'None'}</p></div><StatusBadge status={selectedPress.status} /></div>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl bg-blue-50 p-4"><p className="text-2xl font-black text-process">{selectedPress.availableBlankQuantity}</p><p className="text-xs text-slate-500">Blanks available</p></div>
            <div className="rounded-xl bg-emerald-50 p-4"><p className="text-2xl font-black text-emerald-700">{selectedPress.goodTyreQuantity}</p><p className="text-xs text-slate-500">Good tyres</p></div>
            <div className="rounded-xl bg-red-50 p-4"><p className="text-2xl font-black text-red-700">{selectedPress.rejectedTyreQuantity}</p><p className="text-xs text-slate-500">Rejected tyres</p></div>
            <div className="rounded-xl bg-amber-50 p-4"><p className="text-2xl font-black text-amber-700">{selectedPress.rejectedBlankQuantity}</p><p className="text-xs text-slate-500">Rejected blanks</p></div>
          </div>
        </section>
      )}

      {canOperate && (
        <form onSubmit={start} className="card mb-7 p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-process"><Play size={20} /></div><div><h2 className="font-black">Start production</h2><p className="text-xs text-slate-500">Use only a cart already received at its destination press.</p></div></div>
          <div className="grid gap-4 md:grid-cols-3">
            <label><span className="label">Received cart</span><select className="field" required value={startForm.cartId} onChange={(e) => { const cart = carts.find((item) => item.id === Number(e.target.value)); setStartForm({ cartId: e.target.value, pressId: cart ? String(cart.destinationPressId) : '' }) }}><option value="">Select cart</option>{usableCarts.map((cart) => <option key={cart.id} value={cart.id}>{cart.cartNumber} · {cart.remainingQuantity} blanks · {cart.destinationPressNumber}</option>)}</select></label>
            <label><span className="label">Press</span><select className={`field ${pressFilter ? 'bg-slate-50' : ''}`} required disabled={Boolean(pressFilter)} value={startForm.pressId} onChange={(e) => setStartForm({ ...startForm, pressId: e.target.value })}><option value="">Select press</option>{presses.filter((press) => press.active).map((press) => <option key={press.id} value={press.id}>{press.pressNumber} · {press.availableBlankQuantity} available</option>)}</select></label>
            <label><span className="label">Operator identity</span><input className="field bg-slate-50" disabled value={`${user?.fullName} · ${user?.employeeId ?? 'ID TBC'}`} /></label>
          </div>
          {selectedCart && <p className="mt-3 text-xs text-slate-500">Traceability: {selectedCart.blankingBatchNumber} ← {selectedCart.mixingBatchNumber} · {selectedCart.materialCode}</p>}
          <div className="mt-5 flex justify-end"><button className="btn-primary"><Play size={17} /> Record start time</button></div>
        </form>
      )}

      {visibleRecords.length === 0 ? <EmptyState title="No Moulding records" message="Receive a cart, then start the first press production record." /> : (
        <div className="table-shell">
          <table>
            <thead><tr><th>Press / shift</th><th>Cart traceability</th><th>IN / OUT</th><th>Good / rejected</th><th>Remaining</th><th>Downtime</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{visibleRecords.map((record) => (
              <tr key={record.id}>
                <td><p className="font-black">{record.pressNumber}</p><p className="text-xs text-slate-500">{record.productionDate} · {record.shift.replace('_', ' ')}</p></td>
                <td>{record.cartNumber}<p className="text-xs text-slate-500">{record.blankingBatchNumber} · {record.operatorEmployeeId}</p></td>
                <td>{formatDateTime(record.startTime)}<p className="text-xs text-slate-500">{formatDateTime(record.endTime)}</p></td>
                <td><span className="font-bold text-emerald-700">{record.goodTyreQuantity}</span> / <span className="font-bold text-red-700">{record.rejectedTyreQuantity} tyres + {record.rejectedBlankQuantity} blanks</span><p className="text-xs text-slate-500">{record.totalRejectedTyreWeightGrams} g rejected tyre weight</p></td>
                <td>{record.remainingBlankQuantity}</td>
                <td>{record.downtimeMinutes} min<p className="text-xs text-slate-500">{record.downtimeReason ?? '—'}</p></td>
                <td><StatusBadge status={record.status} /></td>
                <td>
                  {canCompleteRecord(record) && <button className="btn-primary" onClick={() => { setCorrectionMode(false); setCompletion({ ...emptyCompletion, id: record.id, goodTyreQuantity: '' }) }}><CheckCircle2 size={16} /> Enter output</button>}
                  {canCorrect && record.status === 'COMPLETED' && <button className="btn-secondary" onClick={() => { setCorrectionMode(true); setCorrectionReason(''); setCompletion({ id: record.id, goodTyreQuantity: String(record.goodTyreQuantity), rejectedTyreQuantity: String(record.rejectedTyreQuantity), rejectedTyreWeightPerItemGrams: String(record.rejectedTyreWeightPerItemGrams), rejectedBlankQuantity: String(record.rejectedBlankQuantity), downtimeMinutes: String(record.downtimeMinutes), downtimeReason: record.downtimeReason ?? '', operatorNote: record.operatorNote ?? '' }) }}><Pencil size={16} /> Correct</button>}
                  {!(canCompleteRecord(record) || (canCorrect && record.status === 'COMPLETED')) && <span className="text-xs text-slate-400">{record.status === 'IN_PROGRESS' ? `Assigned to ${record.operator.fullName}` : 'Recorded'}</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {activeRecord && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/60 p-4">
          <form onSubmit={complete} className="my-6 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start gap-3"><CircleDot className="mt-1 text-process" /><div><h2 className="text-xl font-black">{correctionMode ? 'Correct' : 'Complete'} {activeRecord.pressNumber} production</h2><p className="text-sm text-slate-500">{activeRecord.cartNumber} · Starting quantity {activeRecord.quantityReceived} blanks</p>{correctionMode && <p className="mt-1 text-xs font-bold text-amber-700">This does not overwrite audit history. Inventory is rebalanced transactionally.</p>}</div></div>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-100 p-3"><p className="text-2xl font-black">{activeRecord.quantityReceived}</p><p className="text-xs">Starting blanks</p></div>
              <div className="rounded-xl bg-blue-50 p-3"><p className="text-2xl font-black text-process">{usedPreview}</p><p className="text-xs">Used</p></div>
              <div className="rounded-xl bg-emerald-50 p-3"><p className="text-2xl font-black text-emerald-700">{remainingPreview}</p><p className="text-xs">Remaining</p></div>
              <div className="rounded-xl bg-red-50 p-3"><p className="text-2xl font-black text-red-700">{Number(completion.rejectedTyreQuantity || 0) * Number(completion.rejectedTyreWeightPerItemGrams || 0)} g</p><p className="text-xs">Rejected tyre weight</p></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label><span className="label">Good tyres</span><input className="field" required min="0" max={activeRecord.quantityReceived} type="number" value={completion.goodTyreQuantity} onChange={(e) => setCompletion({ ...completion, goodTyreQuantity: e.target.value })} /></label>
              <label><span className="label">Rejected tyres</span><input className="field" required min="0" type="number" value={completion.rejectedTyreQuantity} onChange={(e) => setCompletion({ ...completion, rejectedTyreQuantity: e.target.value })} /></label>
              <label><span className="label">Weight per rejected tyre (g)</span><input className="field" required min="0" step="0.001" type="number" value={completion.rejectedTyreWeightPerItemGrams} onChange={(e) => setCompletion({ ...completion, rejectedTyreWeightPerItemGrams: e.target.value })} /></label>
              <label><span className="label">Rejected blanks</span><input className="field" required min="0" type="number" value={completion.rejectedBlankQuantity} onChange={(e) => setCompletion({ ...completion, rejectedBlankQuantity: e.target.value })} /></label>
              <label><span className="label">Downtime (minutes)</span><input className="field" required min="0" type="number" value={completion.downtimeMinutes} onChange={(e) => setCompletion({ ...completion, downtimeMinutes: e.target.value })} /></label>
              <label><span className="label">Downtime reason</span><input className="field" required={Number(completion.downtimeMinutes) > 0} value={completion.downtimeReason} onChange={(e) => setCompletion({ ...completion, downtimeReason: e.target.value })} /></label>
              <label className="sm:col-span-2 lg:col-span-3"><span className="label">Operator note</span><textarea className="field min-h-20" value={completion.operatorNote} onChange={(e) => setCompletion({ ...completion, operatorNote: e.target.value })} /></label>
              {correctionMode && <label className="sm:col-span-2 lg:col-span-3"><span className="label">Correction reason</span><textarea className="field min-h-20" required value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} placeholder="Explain why this completed production record must be corrected." /></label>}
            </div>
            {usedPreview > activeRecord.quantityReceived && <p role="alert" className="mt-4 text-sm font-bold text-red-700">Output and rejection totals exceed the available blanks.</p>}
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => { setCompletion(emptyCompletion); setCorrectionMode(false); setCorrectionReason('') }}>Cancel</button><button className="btn-primary" disabled={usedPreview > activeRecord.quantityReceived || (correctionMode && !correctionReason.trim())}>{correctionMode ? 'Save audited correction' : 'Record output & complete'}</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
