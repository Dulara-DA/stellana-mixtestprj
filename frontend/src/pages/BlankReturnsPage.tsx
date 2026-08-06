import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeftRight, CheckCircle2, Send } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime } from '../lib/api'
import type { BlankReturn, BlankingCart, Press } from '../types'

const TOPICS = ['/topic/blanking', '/topic/moulding'] as const
const emptyPrepare = { cartId: '', pressId: '', quantity: '', measuredReturnWeightKg: '', returnReason: '', mouldingNote: '' }
const emptyConfirm = { id: 0, receivedQuantity: '', receivedWeightKg: '', varianceNote: '' }

export function BlankReturnsPage() {
  const { user } = useAuth()
  const canPrepare = ['MOULDING_OPERATOR', 'MOULDING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canConfirm = ['BLANKING_OPERATOR', 'BLANKING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canResolveVariance = ['BLANKING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const [returns, setReturns] = useState<BlankReturn[]>([])
  const [carts, setCarts] = useState<BlankingCart[]>([])
  const [presses, setPresses] = useState<Press[]>([])
  const [prepare, setPrepare] = useState(emptyPrepare)
  const [confirm, setConfirm] = useState(emptyConfirm)
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const [returnData, cartData, pressData] = await Promise.all([
        api<BlankReturn[]>('/api/moulding/returns'),
        api<BlankingCart[]>('/api/blanking/carts'),
        api<Press[]>('/api/moulding/presses'),
      ])
      setReturns(returnData)
      setCarts(cartData)
      setPresses(pressData)
      setError('')
    } catch (reason) { setError(displayError(reason)) }
  }, [])
  const connected = useRealtimeRefresh(load, TOPICS)
  const eligibleCarts = carts.filter((cart) =>
    ['RECEIVED_AT_MOULDING', 'PARTIALLY_CONSUMED'].includes(cart.status) && cart.remainingQuantity > 0)
  const selectedCart = useMemo(
    () => carts.find((cart) => cart.id === Number(prepare.cartId)),
    [carts, prepare.cartId],
  )
  const calculatedWeight = selectedCart?.averageBlankWeightGrams && Number(prepare.quantity) > 0
    ? (Number(prepare.quantity) * selectedCart.averageBlankWeightGrams) / 1000 : 0
  const visibleReturns = returns.filter((item) => !statusFilter || item.status === statusFilter)

  const prepareReturn = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await api('/api/moulding/returns', {
        method: 'POST',
        body: JSON.stringify({
          ...prepare,
          cartId: Number(prepare.cartId),
          pressId: Number(prepare.pressId),
          quantity: Number(prepare.quantity),
          measuredReturnWeightKg: Number(prepare.measuredReturnWeightKg),
        }),
      })
      setPrepare(emptyPrepare)
      setMessage('Unused blanks reserved and return record prepared.')
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const sendReturn = async (value: BlankReturn) => {
    if (!window.confirm(`Send ${value.returnNumber} to Blanking for confirmation?`)) return
    try {
      await api(`/api/moulding/returns/${value.id}/send`, { method: 'POST' })
      setMessage(`${value.returnNumber} sent to Blanking.`)
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const confirmReturn = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await api(`/api/blanking/returns/${confirm.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          receivedQuantity: Number(confirm.receivedQuantity),
          receivedWeightKg: Number(confirm.receivedWeightKg),
          varianceNote: confirm.varianceNote,
        }),
      })
      setConfirm(emptyConfirm)
      setMessage('Return verified and Blanking inventory updated.')
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Unused blank control"
        title="Blank return"
        description="Moulding reserves unused blanks before sending them. Blanking inventory increases only after physical verification."
        actions={<LiveIndicator connected={connected} />}
      />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

      {canPrepare && (
        <form onSubmit={prepareReturn} className="card mb-6 p-5">
          <div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-process"><ArrowLeftRight size={21} /></div><div><h2 className="font-black">Prepare unused blanks for return</h2><p className="text-xs text-slate-500">Official operator, shift and sending time come from the server.</p></div></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <label className="xl:col-span-2"><span className="label">Cart</span><select className="field" required value={prepare.cartId} onChange={(e) => { const cart = carts.find((item) => item.id === Number(e.target.value)); setPrepare({ ...prepare, cartId: e.target.value, pressId: cart ? String(cart.destinationPressId) : '' }) }}><option value="">Select received cart</option>{eligibleCarts.map((cart) => <option key={cart.id} value={cart.id}>{cart.cartNumber} · {cart.itemCode ?? cart.materialCode} · {cart.remainingQuantity} available</option>)}</select></label>
            <label><span className="label">Press</span><select className="field" required value={prepare.pressId} onChange={(e) => setPrepare({ ...prepare, pressId: e.target.value })}><option value="">Select press</option>{presses.map((press) => <option key={press.id} value={press.id}>{press.pressNumber}</option>)}</select></label>
            <label><span className="label">Return quantity (pieces)</span><input className="field" required type="number" min="1" max={selectedCart?.remainingQuantity} value={prepare.quantity} onChange={(e) => setPrepare({ ...prepare, quantity: e.target.value })} /></label>
            <label><span className="label">Measured return weight (kg)</span><input className="field" required type="number" min="0" step="0.001" value={prepare.measuredReturnWeightKg} onChange={(e) => setPrepare({ ...prepare, measuredReturnWeightKg: e.target.value })} /></label>
            <div className="rounded-xl bg-slate-50 p-3"><span className="label">Calculated weight</span><p className="font-black">{calculatedWeight.toFixed(3)} kg</p><p className="text-xs text-slate-500">For variance comparison</p></div>
            <label className="md:col-span-2 xl:col-span-3"><span className="label">Return reason</span><input className="field" required value={prepare.returnReason} onChange={(e) => setPrepare({ ...prepare, returnReason: e.target.value })} /></label>
            <label className="md:col-span-2 xl:col-span-3"><span className="label">Moulding note</span><input className="field" value={prepare.mouldingNote} onChange={(e) => setPrepare({ ...prepare, mouldingNote: e.target.value })} /></label>
          </div>
          <div className="mt-5 flex justify-end"><button className="btn-primary">Prepare return</button></div>
        </form>
      )}

      <div className="mb-4 flex justify-end"><label className="w-full max-w-xs"><span className="label">Return status</span><select className="field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option>{['RETURN_PREPARED', 'SENT_TO_BLANKING', 'AWAITING_CONFIRMATION', 'QUANTITY_DISPUTED', 'CLOSED'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label></div>
      {visibleReturns.length === 0 ? <EmptyState title="No blank returns" message="Returns prepared by Moulding and confirmed by Blanking will appear here." /> : (
        <div className="table-shell">
          <table>
            <thead><tr><th>Return / trace</th><th>Press / cart</th><th>Sent quantity / weight</th><th>Operators / times</th><th>Received / variance</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{visibleReturns.map((value) => (
              <tr key={value.id}>
                <td><p className="font-black">{value.returnNumber}</p><p className="text-xs text-slate-500">{value.compoundBatchNumber} → {value.blankingBatchNumber} · {value.itemCode ?? value.compoundCode}</p></td>
                <td>{value.pressNumber}<p className="text-xs text-slate-500">{value.cartNumber}</p></td>
                <td>{value.preparedQuantity} pieces<p className="text-xs text-slate-500">{value.measuredReturnWeightKg} kg · {value.averageBlankWeightGrams} g each</p></td>
                <td>{value.sendingOperator.fullName}<p className="text-xs text-slate-500">{formatDateTime(value.sendingDateTime)}</p>{value.receivingOperator && <p className="mt-1 text-xs text-emerald-700">Received: {value.receivingOperator.fullName} · {formatDateTime(value.receivingDateTime)}</p>}</td>
                <td>{value.receivedQuantity ?? '—'} pieces<p className="text-xs text-slate-500">{value.receivedWeightKg ?? '—'} kg · variance {value.quantityVariance ?? 0} pieces / {value.weightVarianceKg ?? 0} kg</p></td>
                <td><StatusBadge status={value.status} /></td>
                <td><div className="flex flex-wrap gap-2">
                  {canPrepare && value.status === 'RETURN_PREPARED' && <button className="btn-primary" onClick={() => sendReturn(value)}><Send size={16} /> Send</button>}
                  {canConfirm && ['SENT_TO_BLANKING', 'AWAITING_CONFIRMATION'].includes(value.status) && <button className="btn-primary" onClick={() => setConfirm({ id: value.id, receivedQuantity: String(value.preparedQuantity), receivedWeightKg: String(value.measuredReturnWeightKg), varianceNote: '' })}><CheckCircle2 size={16} /> Confirm</button>}
                  {canResolveVariance && value.status === 'QUANTITY_DISPUTED' && <button className="btn-primary" onClick={() => setConfirm({ id: value.id, receivedQuantity: String(value.receivedQuantity ?? value.preparedQuantity), receivedWeightKg: String(value.receivedWeightKg ?? value.measuredReturnWeightKg), varianceNote: value.varianceNote ?? '' })}><CheckCircle2 size={16} /> Resolve variance</button>}
                  {!((canPrepare && value.status === 'RETURN_PREPARED') || (canConfirm && ['SENT_TO_BLANKING', 'AWAITING_CONFIRMATION'].includes(value.status)) || (canResolveVariance && value.status === 'QUANTITY_DISPUTED')) && <span className="text-xs text-slate-400">Recorded</span>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {confirm.id > 0 && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4">
          <form onSubmit={confirmReturn} className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-black">Confirm physical return</h2>
            <p className="mt-1 text-sm text-slate-500">Enter the quantities physically received in Blanking.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label><span className="label">Received quantity (pieces)</span><input className="field" required type="number" min="0" value={confirm.receivedQuantity} onChange={(e) => setConfirm({ ...confirm, receivedQuantity: e.target.value })} /></label>
              <label><span className="label">Received weight (kg)</span><input className="field" required type="number" min="0" step="0.001" value={confirm.receivedWeightKg} onChange={(e) => setConfirm({ ...confirm, receivedWeightKg: e.target.value })} /></label>
              <label className="sm:col-span-2"><span className="label">Variance note (required if different)</span><textarea className="field min-h-24" value={confirm.varianceNote} onChange={(e) => setConfirm({ ...confirm, varianceNote: e.target.value })} /></label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setConfirm(emptyConfirm)}>Cancel</button><button className="btn-primary">Confirm receipt</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
