import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { Ban, PackagePlus, Send, Truck, Unlock } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime } from '../lib/api'
import type { BlankingBatch, BlankingCart, Press } from '../types'

const TOPICS = ['/topic/blanking'] as const

export function BlankingCartsPage() {
  const { user } = useAuth()
  const canOperate = ['BLANKING_OPERATOR', 'BLANKING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const [batches, setBatches] = useState<BlankingBatch[]>([])
  const [carts, setCarts] = useState<BlankingCart[]>([])
  const [presses, setPresses] = useState<Press[]>([])
  const [form, setForm] = useState({ cartNumber: '', blankingBatchId: '', quantity: '', averageBlankWeightGrams: '', destinationPressId: '', blankingNote: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const [batchData, cartData, pressData] = await Promise.all([
        api<BlankingBatch[]>('/api/blanking/batches'),
        api<BlankingCart[]>('/api/blanking/carts'),
        api<Press[]>('/api/moulding/presses'),
      ])
      setBatches(batchData)
      setCarts(cartData)
      setPresses(pressData)
      setError('')
    } catch (reason) { setError(displayError(reason)) }
  }, [])
  const connected = useRealtimeRefresh(load, TOPICS)
  const selected = useMemo(() => batches.find((item) => item.id === Number(form.blankingBatchId)), [batches, form.blankingBatchId])
  const wholeCartBlankWeightKg = useMemo(() => {
    const quantity = Number(form.quantity)
    const blankWeightGrams = Number(form.averageBlankWeightGrams)
    return quantity > 0 && blankWeightGrams > 0 ? (blankWeightGrams * quantity) / 1000 : null
  }, [form.averageBlankWeightGrams, form.quantity])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await api('/api/blanking/carts', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          blankingBatchId: Number(form.blankingBatchId),
          quantity: Number(form.quantity),
          averageBlankWeightGrams: Number(form.averageBlankWeightGrams),
          destinationPressId: Number(form.destinationPressId),
        }),
      })
      setForm({ cartNumber: '', blankingBatchId: '', quantity: '', averageBlankWeightGrams: '', destinationPressId: '', blankingNote: '' })
      setMessage('Cart prepared. Blanks have been reserved from the batch inventory.')
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const dispatch = async (cart: BlankingCart) => {
    if (!window.confirm(`Dispatch ${cart.cartNumber} with ${cart.quantity} blanks to ${cart.destinationPressNumber}?`)) return
    try {
      await api(`/api/blanking/carts/${cart.id}/dispatch`, { method: 'POST', body: JSON.stringify({ note: 'Dispatched from Blanking UI' }) })
      setMessage(`${cart.cartNumber} dispatched to Moulding.`)
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const hold = async (cart: BlankingCart) => {
    const reason = window.prompt(`Why should ${cart.cartNumber} be held in Blanking?`)
    if (!reason?.trim()) return
    try {
      await api(`/api/blanking/carts/${cart.id}/hold`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      setMessage(`${cart.cartNumber} held in Blanking.`)
      await load()
    } catch (reasonValue) { setError(displayError(reasonValue)) }
  }

  const release = async (cart: BlankingCart) => {
    if (!window.confirm(`Release ${cart.cartNumber} and make it ready for dispatch?`)) return
    try {
      await api(`/api/blanking/carts/${cart.id}/release`, {
        method: 'POST',
        body: JSON.stringify({ note: 'Released from hold by authorized user.' }),
      })
      setMessage(`${cart.cartNumber} is ready for dispatch.`)
      await load()
    } catch (reasonValue) { setError(displayError(reasonValue)) }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Traceable transfer"
        title="Blanking carts"
        description="Prepare and dispatch uniquely numbered carts to a specific Moulding press. Receipt can be recorded exactly once."
        actions={<LiveIndicator connected={connected} />}
      />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

      {canOperate && (
        <form onSubmit={create} className="card mb-7 p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-process"><PackagePlus size={21} /></div><div><h2 className="font-black">Prepare a cart</h2><p className="text-xs text-slate-500">Only completed batches with available good blanks can supply a cart.</p></div></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
            <label><span className="label">Cart number</span><input className="field" required value={form.cartNumber} onChange={(e) => setForm({ ...form, cartNumber: e.target.value })} placeholder="CART-001" /></label>
            <label className="xl:col-span-2"><span className="label">Blanking batch</span><select className="field" required value={form.blankingBatchId} onChange={(e) => setForm({ ...form, blankingBatchId: e.target.value })}><option value="">Select source</option>{batches.filter((batch) => batch.availableGoodBlankQuantity > 0).map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNumber} · {batch.materialCode} · {batch.availableGoodBlankQuantity} available</option>)}</select></label>
            <label><span className="label">No. of blanks</span><input className="field" required type="number" min="1" max={selected?.availableGoodBlankQuantity} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="100" /></label>
            <label><span className="label">One blank weight (g)</span><input className="field" required type="number" min="0.001" step="0.001" value={form.averageBlankWeightGrams} onChange={(e) => setForm({ ...form, averageBlankWeightGrams: e.target.value })} placeholder="100.000" /></label>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3" aria-live="polite">
              <p className="label">Whole blanks weight of cart</p>
              <p className="mt-2 text-xl font-black text-process">{wholeCartBlankWeightKg == null ? '—' : wholeCartBlankWeightKg.toFixed(3)} <span className="text-xs text-slate-500">kg</span></p>
              <p className="mt-1 text-[11px] text-slate-500">(blank grams × no. of blanks) ÷ 1000</p>
            </div>
            <label><span className="label">Destination press</span><select className="field" required value={form.destinationPressId} onChange={(e) => setForm({ ...form, destinationPressId: e.target.value })}><option value="">Select press</option>{presses.filter((press) => press.active).map((press) => <option key={press.id} value={press.id}>{press.pressNumber} · {press.pressName}</option>)}</select></label>
            <label className="md:col-span-2 xl:col-span-7"><span className="label">Blanking note</span><input className="field" value={form.blankingNote} onChange={(e) => setForm({ ...form, blankingNote: e.target.value })} /></label>
          </div>
          <div className="mt-5 flex justify-end"><button className="btn-primary"><PackagePlus size={18} /> Prepare cart</button></div>
        </form>
      )}

      {carts.length === 0 ? <EmptyState title="No carts prepared" message="Complete a blanking batch, then prepare a cart for a destination press." /> : (
        <div className="table-shell">
          <table>
            <thead><tr><th>Cart / item</th><th>Source traceability</th><th>Quantity / weight</th><th>Destination</th><th>Dispatch / hold</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{carts.map((cart) => (
              <tr key={cart.id}>
                <td><p className="font-black text-ink">{cart.cartNumber}</p><p className="text-xs">{cart.itemCode ?? 'Item TBC'} · {formatDateTime(cart.createdAt)}</p></td>
                <td>{cart.blankingBatchNumber}<p className="text-xs text-slate-500">{cart.mixingBatchNumber} · {cart.materialCode}</p></td>
                <td>{cart.quantity} pieces<p className="text-xs text-slate-500">{cart.materialWeightKg ?? '—'} kg · {cart.averageBlankWeightGrams ?? '—'} g/blank</p><p className="text-xs text-slate-500">{cart.remainingQuantity} remaining · {cart.returnedQuantity} returned</p></td>
                <td>{cart.destinationPressNumber}<p className="text-xs text-slate-500">{cart.destinationPressName}</p></td>
                <td>{cart.status === 'HELD' ? <><span className="font-bold text-amber-700">Held</span><p className="text-xs text-slate-500">{cart.holdReason} · {formatDateTime(cart.heldAt)}</p></> : formatDateTime(cart.dispatchedAt)}</td>
                <td><StatusBadge status={cart.status} /></td>
                <td><div className="flex flex-wrap gap-2">
                  {canOperate && ['PREPARED', 'READY_FOR_DISPATCH'].includes(cart.status) && <button className="btn-primary" onClick={() => dispatch(cart)}><Send size={16} /> Dispatch</button>}
                  {canOperate && ['PREPARED', 'READY_FOR_DISPATCH'].includes(cart.status) && <button className="btn-secondary" onClick={() => hold(cart)}><Ban size={16} /> Hold</button>}
                  {['BLANKING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '') && cart.status === 'HELD' && <button className="btn-primary" onClick={() => release(cart)}><Unlock size={16} /> Release</button>}
                  {!['PREPARED', 'READY_FOR_DISPATCH', 'HELD'].includes(cart.status) && <Truck size={18} className="text-slate-400" />}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
