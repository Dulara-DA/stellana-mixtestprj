import { Fragment, useCallback, useMemo, useState, type FormEvent } from 'react'
import { Ban, CheckCircle2, Factory, PackagePlus, Play, Plus, Send, Truck, Unlock } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime, humanize } from '../lib/api'
import type { BlankingBatch, BlankingCart, OperatorOption } from '../types'

const TOPICS = ['/topic/blanking'] as const

const initialProductionForm = {
  existingBatchId: '',
  batchNumber: '',
  materialCode: '',
  itemCode: '',
  millOperator: '',
  preformerOperator: '',
  cartNumber: '',
  quantity: '',
  averageBlankWeightGrams: '',
  notes: '',
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

type ProductionRow = {
  batch: BlankingBatch
  cart?: BlankingCart
}

const columnHeaderClass = 'border-b border-slate-200 px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-600'
const recordCellClass = 'border-b border-slate-200 px-4 py-5 align-top text-sm text-slate-700'
const detailValueClass = 'rounded-lg bg-slate-50 p-3'

export function BlankingProductionPage() {
  const { user } = useAuth()
  const canOperate = ['BLANKING_OPERATOR', 'BLANKING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canReleaseHold = ['BLANKING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const [batches, setBatches] = useState<BlankingBatch[]>([])
  const [carts, setCarts] = useState<BlankingCart[]>([])
  const [operatorOptions, setOperatorOptions] = useState<OperatorOption[]>([])
  const [productionForm, setProductionForm] = useState(initialProductionForm)
  const [completion, setCompletion] = useState(emptyCompletion)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [recordBusy, setRecordBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [batchValues, cartValues, operatorValues] = await Promise.all([
        api<BlankingBatch[]>('/api/blanking/batches'),
        api<BlankingCart[]>('/api/blanking/carts'),
        api<OperatorOption[]>('/api/users/blanking-operators'),
      ])
      setBatches(batchValues)
      setCarts(cartValues)
      setOperatorOptions(operatorValues)
      setError('')
    } catch (reason) {
      setError(displayError(reason))
    }
  }, [])

  const connected = useRealtimeRefresh(load, TOPICS)
  const selectedExistingBatch = useMemo(
    () => batches.find((item) => item.id === Number(productionForm.existingBatchId)),
    [batches, productionForm.existingBatchId],
  )
  const wholeCartBlankWeightKg = useMemo(() => {
    const quantity = Number(productionForm.quantity)
    const blankWeightGrams = Number(productionForm.averageBlankWeightGrams)
    return quantity > 0 && blankWeightGrams > 0 ? (blankWeightGrams * quantity) / 1000 : null
  }, [productionForm.averageBlankWeightGrams, productionForm.quantity])

  const productionRows = useMemo<ProductionRow[]>(() => {
    const cartsByBatch = new Map<number, BlankingCart[]>()
    carts.forEach((cart) => {
      const linked = cartsByBatch.get(cart.blankingBatchId) ?? []
      linked.push(cart)
      cartsByBatch.set(cart.blankingBatchId, linked)
    })
    return batches.flatMap((batch) => {
      const linkedCarts = cartsByBatch.get(batch.id) ?? []
      return linkedCarts.length > 0
        ? linkedCarts.map((cart) => ({ batch, cart }))
        : [{ batch }]
    })
  }, [batches, carts])

  const recordProduction = async (event: FormEvent) => {
    event.preventDefault()
    setRecordBusy(true)
    setError('')
    setMessage('')
    try {
      if (selectedExistingBatch) {
        await api('/api/blanking/carts', {
          method: 'POST',
          body: JSON.stringify({
            cartNumber: productionForm.cartNumber,
            blankingBatchId: selectedExistingBatch.id,
            quantity: Number(productionForm.quantity),
            averageBlankWeightGrams: Number(productionForm.averageBlankWeightGrams),
            blankingNote: productionForm.notes,
          }),
        })
        setMessage(`${productionForm.cartNumber.toUpperCase()} recorded for Batch ${selectedExistingBatch.batchNumber}.`)
      } else {
        await api('/api/blanking/production-records', {
          method: 'POST',
          body: JSON.stringify({
            batchNumber: productionForm.batchNumber,
            materialCode: productionForm.materialCode,
            itemCode: productionForm.itemCode,
            millOperator: productionForm.millOperator,
            preformerOperator: productionForm.preformerOperator,
            cartNumber: productionForm.cartNumber,
            quantity: Number(productionForm.quantity),
            averageBlankWeightGrams: Number(productionForm.averageBlankWeightGrams),
            notes: productionForm.notes,
          }),
        })
        setMessage(`Batch ${productionForm.batchNumber.toUpperCase()} and Cart ${productionForm.cartNumber.toUpperCase()} recorded together.`)
      }
      setProductionForm(initialProductionForm)
      await load()
    } catch (reason) {
      setError(displayError(reason))
    } finally {
      setRecordBusy(false)
    }
  }

  const start = async (id: number) => {
    if (!window.confirm('Record the official IN time and start this blanking batch now?')) return
    setError('')
    try {
      await api(`/api/blanking/batches/${id}/start`, { method: 'POST' })
      setMessage('Blanking batch started and official IN time recorded.')
      await load()
    } catch (reason) {
      setError(displayError(reason))
    }
  }

  const complete = async (event: FormEvent) => {
    event.preventDefault()
    if (!window.confirm('Complete this batch and record the official OUT time?')) return
    setError('')
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
      setMessage('Output, rejection and official OUT time recorded.')
      await load()
    } catch (reason) {
      setError(displayError(reason))
    }
  }

  const dispatch = async (cart: BlankingCart) => {
    if (!window.confirm(`Dispatch ${cart.cartNumber} with ${cart.quantity} blanks to Moulding?`)) return
    setError('')
    try {
      await api(`/api/blanking/carts/${cart.id}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({ note: 'Dispatched from Blanking Production Records.' }),
      })
      setMessage(`${cart.cartNumber} dispatched to Moulding. The receiving operator will allocate its press.`)
      await load()
    } catch (reason) {
      setError(displayError(reason))
    }
  }

  const hold = async (cart: BlankingCart) => {
    const reason = window.prompt(`Why should ${cart.cartNumber} be held in Blanking?`)
    if (!reason?.trim()) return
    setError('')
    try {
      await api(`/api/blanking/carts/${cart.id}/hold`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      setMessage(`${cart.cartNumber} held in Blanking.`)
      await load()
    } catch (reasonValue) {
      setError(displayError(reasonValue))
    }
  }

  const release = async (cart: BlankingCart) => {
    if (!window.confirm(`Release ${cart.cartNumber} and make it ready for dispatch?`)) return
    setError('')
    try {
      await api(`/api/blanking/carts/${cart.id}/release`, {
        method: 'POST',
        body: JSON.stringify({ note: 'Released from hold in Blanking Production Records.' }),
      })
      setMessage(`${cart.cartNumber} is ready for dispatch.`)
      await load()
    } catch (reasonValue) {
      setError(displayError(reasonValue))
    }
  }

  const prepareAnotherCart = (batch: BlankingBatch) => {
    setProductionForm({
      ...initialProductionForm,
      existingBatchId: String(batch.id),
      batchNumber: batch.batchNumber,
      materialCode: batch.materialCode,
      itemCode: batch.itemCode ?? '',
      millOperator: batch.millOperator ?? '',
      preformerOperator: batch.preformerOperator ?? '',
    })
    document.getElementById('record-blanking-production')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const cartWeight = (cart: BlankingCart) => {
    if (cart.materialWeightKg != null) return Number(cart.materialWeightKg)
    return (cart.quantity * Number(cart.averageBlankWeightGrams ?? 0)) / 1000
  }

  return (
    <div>
      <PageHeader
        eyebrow="Blank production and cart transfer"
        title="Blanking production records"
        description="Create and complete blanking batches, prepare traceable carts, and review every linked production record in one page."
        actions={<LiveIndicator connected={connected} />}
      />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

      {canOperate && (
        <section id="record-blanking-production" className="card mb-7 scroll-mt-5 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-5 sm:px-6">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-process"><Plus size={21} /></div>
            <div><h2 className="text-lg font-black text-ink">Record batch and cart</h2><p className="text-xs text-slate-500">Enter the physical production details once, then save the connected Batch and Cart with one button.</p></div>
          </div>
          <datalist id="blanking-production-operator-options">
            {operatorOptions.map((operator) => <option key={operator.employeeId} value={`${operator.employeeId} - ${operator.fullName}`} />)}
          </datalist>
          <form onSubmit={recordProduction} className="p-5 sm:p-6">
            {selectedExistingBatch && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
                <p><span className="font-black">Additional cart:</span> {selectedExistingBatch.batchNumber} · {selectedExistingBatch.materialCode} · {selectedExistingBatch.itemCode ?? 'Item TBC'} · {selectedExistingBatch.availableGoodBlankQuantity} blanks available</p>
                <button type="button" className="font-black text-violet-700 underline" onClick={() => setProductionForm(initialProductionForm)}>Record a new batch instead</button>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label><span className="label">Batch No.</span><input className="field" required disabled={Boolean(selectedExistingBatch)} value={productionForm.batchNumber} onChange={(event) => setProductionForm({ ...productionForm, batchNumber: event.target.value })} placeholder="6160" /></label>
              <label><span className="label">Compound type</span><input className="field" required disabled={Boolean(selectedExistingBatch)} value={productionForm.materialCode} onChange={(event) => setProductionForm({ ...productionForm, materialCode: event.target.value })} placeholder="A-96-50" /></label>
              <label><span className="label">Item code</span><input className="field" required disabled={Boolean(selectedExistingBatch)} value={productionForm.itemCode} onChange={(event) => setProductionForm({ ...productionForm, itemCode: event.target.value })} placeholder="UG 200×50" /></label>
              <label><span className="label">Cart No.</span><input className="field" required value={productionForm.cartNumber} onChange={(event) => setProductionForm({ ...productionForm, cartNumber: event.target.value })} placeholder="CART-001" /></label>
              <label><span className="label">Blank quantity</span><input className="field" required type="number" min="1" max={selectedExistingBatch?.availableGoodBlankQuantity} value={productionForm.quantity} onChange={(event) => setProductionForm({ ...productionForm, quantity: event.target.value })} placeholder="100" /></label>
              <label><span className="label">Average blank weight (g)</span><input className="field" required type="number" min="0.001" step="0.001" value={productionForm.averageBlankWeightGrams} onChange={(event) => setProductionForm({ ...productionForm, averageBlankWeightGrams: event.target.value })} placeholder="100.000" /></label>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3" aria-live="polite">
                <p className="label">Total blank weight</p>
                <p className="mt-2 text-xl font-black text-process">{wholeCartBlankWeightKg == null ? '—' : wholeCartBlankWeightKg.toFixed(3)} <span className="text-xs text-slate-500">kg</span></p>
              </div>
              <label><span className="label">Mill operator</span><input className="field" list="blanking-production-operator-options" required disabled={Boolean(selectedExistingBatch)} value={productionForm.millOperator} onChange={(event) => setProductionForm({ ...productionForm, millOperator: event.target.value })} placeholder="EMP.NO - Name" autoComplete="off" /></label>
              <label><span className="label">Performer operator</span><input className="field" list="blanking-production-operator-options" required disabled={Boolean(selectedExistingBatch)} value={productionForm.preformerOperator} onChange={(event) => setProductionForm({ ...productionForm, preformerOperator: event.target.value })} placeholder="EMP.NO - Name" autoComplete="off" /></label>
              <label className="md:col-span-2 xl:col-span-4"><span className="label">Notes (optional)</span><input className="field" value={productionForm.notes} onChange={(event) => setProductionForm({ ...productionForm, notes: event.target.value })} /></label>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">Date, shift, operator, Batch IN/OUT and cart preparation time are recorded by the server. Moulding selects the press during receipt.</p>
              <button className="btn-primary min-w-52 justify-center" disabled={recordBusy}><PackagePlus size={18} /> {recordBusy ? 'Recording…' : selectedExistingBatch ? 'Record cart' : 'Record batch & cart'}</button>
            </div>
          </form>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-lg font-black text-ink">Combined batch and cart records</h2>
            <p className="mt-1 text-sm text-slate-500">Each main row shows one cart and its source batch. Expand the row for full production and transfer details.</p>
          </div>
          <div className="flex gap-2 text-xs font-bold">
            <span className="rounded-full bg-blue-50 px-3 py-2 text-process">{batches.length} batches</span>
            <span className="rounded-full bg-violet-50 px-3 py-2 text-violet-700">{carts.length} carts</span>
          </div>
        </div>
        {productionRows.length === 0 ? <EmptyState title="No blanking production records" message="Create the first blanking batch to begin recording production." /> : (
          <div className="overflow-x-auto">
            <table className="min-w-[2000px] w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-[0.16em]">
                  <th colSpan={4} className="border-b border-r border-slate-200 bg-slate-100 px-4 py-2.5 text-slate-600">Traceability</th>
                  <th colSpan={3} className="border-b border-r border-blue-200 bg-blue-50 px-4 py-2.5 text-blue-800">Blank weight calculation</th>
                  <th colSpan={2} className="border-b border-r border-violet-200 bg-violet-50 px-4 py-2.5 text-violet-800">Operators</th>
                  <th rowSpan={2} className={`${columnHeaderClass} w-48 border-l border-slate-200 bg-slate-50`}>Date / Shift / Time</th>
                  <th rowSpan={2} className={`${columnHeaderClass} w-44 border-l border-slate-200 bg-slate-50`}>Status</th>
                </tr>
                <tr>
                  <th className={`${columnHeaderClass} w-44 bg-slate-50`}>Cart No.</th>
                  <th className={`${columnHeaderClass} w-40 bg-slate-50`}>Compound Type</th>
                  <th className={`${columnHeaderClass} w-40 bg-slate-50`}>Batch No.</th>
                  <th className={`${columnHeaderClass} w-40 border-r border-slate-200 bg-slate-50`}>Item Code</th>
                  <th className={`${columnHeaderClass} w-32 bg-blue-50/60 text-right`}>Blank Qty.</th>
                  <th className={`${columnHeaderClass} w-40 bg-blue-50/60 text-right`}>Average Weight (g)</th>
                  <th className={`${columnHeaderClass} w-40 border-r border-blue-200 bg-blue-50/60 text-right`}>Total Weight (kg)</th>
                  <th className={`${columnHeaderClass} w-52 bg-violet-50/50`}>Mill Operator</th>
                  <th className={`${columnHeaderClass} w-52 border-r border-violet-200 bg-violet-50/50`}>Performer Operator</th>
                </tr>
              </thead>
              <tbody>
                {productionRows.map(({ batch, cart }) => (
                  <Fragment key={`${batch.id}-${cart?.id ?? 'no-cart'}`}>
                    <tr className="bg-white transition-colors hover:bg-blue-50/40">
                      <td className={recordCellClass}><p className="text-base font-black text-ink">{cart?.cartNumber ?? 'Not prepared'}</p>{cart && <p className="mt-1 text-xs text-slate-500">By {cart.createdBy.fullName}</p>}</td>
                      <td className={recordCellClass}><p className="text-base font-black text-ink">{batch.materialCode}</p></td>
                      <td className={recordCellClass}><p className="text-base font-black text-ink">{batch.batchNumber}</p>{batch.mixingBatchNumber !== batch.batchNumber && <p className="mt-1 text-xs text-slate-500">Source {batch.mixingBatchNumber}</p>}</td>
                      <td className={`${recordCellClass} border-r border-slate-200`}><p className="text-base font-black text-ink">{cart?.itemCode ?? batch.itemCode ?? 'Item TBC'}</p></td>
                      <td className={`${recordCellClass} bg-blue-50/20 text-right`}>
                        <p className="text-lg font-black text-ink">{cart?.quantity ?? '—'}</p>
                        <p className="mt-1 text-xs text-slate-500">{cart ? `${cart.remainingQuantity} remaining` : `${batch.availableGoodBlankQuantity} available`}</p>
                      </td>
                      <td className={`${recordCellClass} bg-blue-50/20 text-right`}><p className="text-lg font-black text-ink">{cart ? Number(cart.averageBlankWeightGrams ?? 0).toFixed(3) : '—'}</p><p className="mt-1 text-xs text-slate-500">grams per blank</p></td>
                      <td className={`${recordCellClass} border-r border-blue-200 bg-blue-50/20 text-right`}><p className="inline-flex rounded-lg bg-blue-100 px-3 py-1.5 text-lg font-black text-blue-800">{cart ? cartWeight(cart).toFixed(3) : '—'}</p><p className="mt-1 text-xs text-slate-500">Quantity × average ÷ 1000</p></td>
                      <td className={`${recordCellClass} bg-violet-50/20 font-semibold`}>{batch.millOperator ?? 'TBC'}</td>
                      <td className={`${recordCellClass} border-r border-violet-200 bg-violet-50/20 font-semibold`}>{batch.preformerOperator ?? 'TBC'}</td>
                      <td className={`${recordCellClass} border-l border-slate-200`}><p className="whitespace-nowrap font-bold text-ink">{cart?.productionDate ?? batch.productionDate}</p><p className="mt-1 text-xs font-semibold text-slate-600">{humanize(cart?.shift ?? batch.shift)}</p><p className="mt-1 whitespace-nowrap text-xs text-slate-500">{formatDateTime(cart?.createdAt ?? batch.createdAt)}</p></td>
                      <td className={`${recordCellClass} border-l border-slate-200`}><div className="space-y-2"><div><p className="mb-1 text-[10px] font-bold uppercase text-slate-400">{cart ? 'Cart' : 'Batch'}</p><StatusBadge status={cart?.status ?? batch.status} /></div>{cart && <div><p className="mb-1 text-[10px] font-bold uppercase text-slate-400">Batch</p><StatusBadge status={batch.status} /></div>}</div></td>
                    </tr>
                    <tr className="bg-slate-50/70">
                      <td colSpan={11} className="border-b-4 border-slate-200 px-5 py-3">
                        <details>
                          <summary className="cursor-pointer select-none rounded-lg px-2 py-2 text-sm font-bold text-process hover:bg-blue-50">View operational details and controls</summary>
                          <div className="mt-4 grid gap-4 xl:grid-cols-3">
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Blanking batch details</p>
                              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                                <div className={detailValueClass}><dt className="text-xs text-slate-500">Production date / shift</dt><dd className="mt-1 font-bold">{batch.productionDate} · {humanize(batch.shift)}</dd></div>
                                <div className={detailValueClass}><dt className="text-xs text-slate-500">Record operator</dt><dd className="mt-1 font-bold">{batch.operatorEmployeeId} · {batch.operator.fullName}</dd></div>
                                <div className={detailValueClass}><dt className="text-xs text-slate-500">IN time</dt><dd className="mt-1 font-bold">{formatDateTime(batch.startTime)}</dd></div>
                                <div className={detailValueClass}><dt className="text-xs text-slate-500">OUT time</dt><dd className="mt-1 font-bold">{formatDateTime(batch.endTime)}</dd></div>
                                <div className={detailValueClass}><dt className="text-xs text-slate-500">Good / rejected</dt><dd className="mt-1 font-bold">{batch.actualGoodBlankQuantity} / {batch.rejectedQuantity} blanks</dd></div>
                                <div className={detailValueClass}><dt className="text-xs text-slate-500">Available / assigned</dt><dd className="mt-1 font-bold">{batch.availableGoodBlankQuantity} / {batch.assignedToCartsQuantity}</dd></div>
                                <div className={detailValueClass}><dt className="text-xs text-slate-500">Compound used</dt><dd className="mt-1 font-bold">{batch.actualUsedCompoundWeightKg} kg</dd></div>
                                <div className={detailValueClass}><dt className="text-xs text-slate-500">Compound remaining</dt><dd className="mt-1 font-bold">{batch.remainingCompoundWeightKg} kg</dd></div>
                                <div className={detailValueClass}><dt className="text-xs text-slate-500">Created</dt><dd className="mt-1 font-bold">{formatDateTime(batch.createdAt)}</dd></div>
                                <div className={detailValueClass}><dt className="text-xs text-slate-500">Last updated</dt><dd className="mt-1 font-bold">{formatDateTime(batch.updatedAt)}</dd></div>
                              </dl>
                              {batch.notes && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{batch.notes}</p>}
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Cart transfer details</p>
                              {cart ? (
                                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                                  <div className={detailValueClass}><dt className="text-xs text-slate-500">Production date / shift</dt><dd className="mt-1 font-bold">{cart.productionDate ?? batch.productionDate} · {humanize(cart.shift ?? batch.shift)}</dd></div>
                                  <div className={detailValueClass}><dt className="text-xs text-slate-500">Prepared time / by</dt><dd className="mt-1 font-bold">{formatDateTime(cart.createdAt)} · {cart.createdBy.fullName}</dd></div>
                                  <div className={detailValueClass}><dt className="text-xs text-slate-500">Press allocation</dt><dd className="mt-1 font-bold">Selected by Moulding during receipt</dd></div>
                                  <div className={detailValueClass}><dt className="text-xs text-slate-500">Dispatched</dt><dd className="mt-1 font-bold">{formatDateTime(cart.dispatchedAt)}</dd></div>
                                  <div className={detailValueClass}><dt className="text-xs text-slate-500">Held</dt><dd className="mt-1 font-bold">{formatDateTime(cart.heldAt)}</dd></div>
                                  <div className={detailValueClass}><dt className="text-xs text-slate-500">Released</dt><dd className="mt-1 font-bold">{formatDateTime(cart.releasedAt)}</dd></div>
                                  <div className={detailValueClass}><dt className="text-xs text-slate-500">Hold reason</dt><dd className="mt-1 font-bold">{cart.holdReason ?? '—'}</dd></div>
                                  <div className={detailValueClass}><dt className="text-xs text-slate-500">Cart note</dt><dd className="mt-1 font-bold">{cart.blankingNote ?? '—'}</dd></div>
                                </dl>
                              ) : <p className="mt-3 text-sm text-slate-500">No cart has been prepared from this batch yet.</p>}
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Available controls</p>
                              <div className="mt-4 flex flex-wrap gap-2">
                                {canOperate && batch.status === 'PLANNED' && <button type="button" className="btn-primary" onClick={() => start(batch.id)}><Play size={16} /> Record IN</button>}
                                {canOperate && batch.status === 'IN_PROGRESS' && <button type="button" className="btn-primary" onClick={() => setCompletion({ ...emptyCompletion, id: batch.id })}><CheckCircle2 size={16} /> Record OUT</button>}
                                {canOperate && ['READY', 'PARTIALLY_DISPATCHED'].includes(batch.status) && batch.availableGoodBlankQuantity > 0 && <button type="button" className="btn-secondary" onClick={() => prepareAnotherCart(batch)}><PackagePlus size={16} /> Prepare cart</button>}
                                {cart && canOperate && ['PREPARED', 'READY_FOR_DISPATCH'].includes(cart.status) && <button type="button" className="btn-primary" onClick={() => dispatch(cart)}><Send size={16} /> Dispatch</button>}
                                {cart && canOperate && ['PREPARED', 'READY_FOR_DISPATCH'].includes(cart.status) && <button type="button" className="btn-secondary" onClick={() => hold(cart)}><Ban size={16} /> Hold</button>}
                                {cart && canReleaseHold && cart.status === 'HELD' && <button type="button" className="btn-primary" onClick={() => release(cart)}><Unlock size={16} /> Release</button>}
                                {cart && !['PREPARED', 'READY_FOR_DISPATCH', 'HELD'].includes(cart.status) && <span className="flex items-center gap-2 text-sm font-bold text-slate-500"><Truck size={18} /> Transfer recorded</span>}
                              </div>
                            </div>
                          </div>
                        </details>
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {completion.id > 0 && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4">
          <form onSubmit={complete} className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center gap-3"><Factory className="text-process" /><div><h2 className="text-xl font-black">Complete blanking batch</h2><p className="text-sm text-slate-500">The backend validates piece and compound-weight balances again.</p></div></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="label">Actual good blanks (pieces)</span><input className="field" required min="0" type="number" value={completion.actualGoodBlankQuantity} onChange={(event) => setCompletion({ ...completion, actualGoodBlankQuantity: event.target.value })} /></label>
              <label><span className="label">Rejected blanks (pieces)</span><input className="field" required min="0" type="number" value={completion.rejectedQuantity} onChange={(event) => setCompletion({ ...completion, rejectedQuantity: event.target.value })} /></label>
              <label><span className="label">Rejected material weight (kg)</span><input className="field" required min="0" step="0.001" type="number" value={completion.rejectedMaterialWeightKg} onChange={(event) => setCompletion({ ...completion, rejectedMaterialWeightKg: event.target.value })} /></label>
              <label><span className="label">Measured remaining compound (kg)</span><input className="field" min="0" step="0.001" type="number" value={completion.measuredRemainingCompoundWeightKg} onChange={(event) => setCompletion({ ...completion, measuredRemainingCompoundWeightKg: event.target.value })} placeholder="Leave empty to use calculated balance" /></label>
              <label className="sm:col-span-2"><span className="label">Completion note</span><textarea className="field min-h-24" value={completion.notes} onChange={(event) => setCompletion({ ...completion, notes: event.target.value })} /></label>
              {canReleaseHold && <label className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><input type="checkbox" checked={completion.supervisorConfirmation} onChange={(event) => setCompletion({ ...completion, supervisorConfirmation: event.target.checked })} /><span className="text-sm font-bold text-amber-900">Authorize a measured balance variance</span></label>}
              {completion.supervisorConfirmation && <label className="sm:col-span-2"><span className="label">Required balance confirmation reason</span><textarea className="field min-h-20" required value={completion.balanceConfirmationReason} onChange={(event) => setCompletion({ ...completion, balanceConfirmationReason: event.target.value })} /></label>}
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setCompletion(emptyCompletion)}>Cancel</button><button className="btn-primary">Record OUT & complete</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
