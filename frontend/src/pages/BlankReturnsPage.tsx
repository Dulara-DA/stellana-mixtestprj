import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, ArrowLeftRight, CheckCircle2, RotateCcw, Send } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime } from '../lib/api'
import type { BlankReturn, BlankingCart, MouldingProductionRecord, Press } from '../types'

const TOPICS = ['/topic/blanking', '/topic/moulding'] as const
const emptyPrepare = { cartId: '', pressId: '', returnType: 'UNUSED_GOOD_BLANKS' as 'UNUSED_GOOD_BLANKS' | 'REJECTED_BLANKS' | 'REJECTED_TYRES', productionRecordId: '', quantity: '', measuredReturnWeightKg: '', returnReason: '', mouldingNote: '' }
const emptyConfirm = { id: 0, receivedQuantity: '', receivedWeightKg: '', varianceNote: '', username: '', employeeId: '', password: '' }

const returnTypeLabel = (type: BlankReturn['returnType']) => {
  if (type === 'REJECTED_TYRES') return 'Rejected tyres'
  if (type === 'REJECTED_BLANKS') return 'Rejected blanks'
  return 'Unused good blanks'
}

const returnUnit = (type: BlankReturn['returnType']) => type === 'REJECTED_TYRES' ? 'tyres' : 'pieces'

export function BlankReturnsPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPressId = searchParams.get('press') ?? ''
  const canPrepare = ['MOULDING_OPERATOR', 'MOULDING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canViewPressResults = ['MOULDING_OPERATOR', 'MOULDING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canConfirm = ['BLANKING_OPERATOR', 'BLANKING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canResolveVariance = ['BLANKING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const [returns, setReturns] = useState<BlankReturn[]>([])
  const [carts, setCarts] = useState<BlankingCart[]>([])
  const [presses, setPresses] = useState<Press[]>([])
  const [records, setRecords] = useState<MouldingProductionRecord[]>([])
  const [prepare, setPrepare] = useState(() => ({ ...emptyPrepare, pressId: requestedPressId }))
  const [confirm, setConfirm] = useState(emptyConfirm)
  const [pressFilter, setPressFilter] = useState(requestedPressId)
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const recordRequest = canViewPressResults
        ? api<MouldingProductionRecord[]>('/api/moulding/records')
        : Promise.resolve<MouldingProductionRecord[]>([])
      const [returnData, cartData, pressData, recordData] = await Promise.all([
        api<BlankReturn[]>('/api/moulding/returns'),
        api<BlankingCart[]>('/api/blanking/carts'),
        api<Press[]>('/api/moulding/presses'),
        recordRequest,
      ])
      setReturns(returnData)
      setCarts(cartData)
      setPresses(pressData)
      setRecords(recordData)
      setError('')
    } catch (reason) { setError(displayError(reason)) }
  }, [canViewPressResults])
  const connected = useRealtimeRefresh(load, TOPICS)
  useEffect(() => {
    setPressFilter(requestedPressId)
    if (canPrepare) {
      setPrepare((current) => ({ ...current, pressId: requestedPressId, cartId: '', productionRecordId: '', quantity: '', measuredReturnWeightKg: '' }))
    }
  }, [canPrepare, requestedPressId])
  const eligibleCarts = carts.filter((cart) =>
    ['RECEIVED_AT_MOULDING', 'PARTIALLY_CONSUMED'].includes(cart.status) && cart.remainingQuantity > 0)
  const eligibleCartsForPress = prepare.pressId
    ? eligibleCarts.filter((cart) => cart.destinationPressId === Number(prepare.pressId))
    : eligibleCarts
  const selectedCart = useMemo(
    () => carts.find((cart) => cart.id === Number(prepare.cartId)),
    [carts, prepare.cartId],
  )
  const selectedConfirmReturn = useMemo(
    () => returns.find((value) => value.id === confirm.id),
    [returns, confirm.id],
  )
  const calculatedWeight = prepare.returnType === 'REJECTED_TYRES'
    ? Number(prepare.measuredReturnWeightKg || 0)
    : selectedCart?.averageBlankWeightGrams && Number(prepare.quantity) > 0
      ? (Number(prepare.quantity) * selectedCart.averageBlankWeightGrams) / 1000
      : Number(prepare.measuredReturnWeightKg || 0)
  const completedRecords = useMemo(
    () => records.filter((record) => record.status === 'COMPLETED'
      && (!pressFilter || record.pressId === Number(pressFilter))),
    [pressFilter, records],
  )
  const latestCompletedRecordIds = useMemo(() => {
    const seenCarts = new Set<number>()
    const latestIds = new Set<number>()
    records.forEach((record) => {
      if (record.status === 'COMPLETED' && !seenCarts.has(record.cartId)) {
        seenCarts.add(record.cartId)
        latestIds.add(record.id)
      }
    })
    return latestIds
  }, [records])
  const latestReturnByCart = useMemo(() => {
    const result = new Map<number, BlankReturn>()
    returns.forEach((value) => {
      if (value.returnType === 'UNUSED_GOOD_BLANKS' && !result.has(value.cartId)) result.set(value.cartId, value)
    })
    return result
  }, [returns])
  const rejectedReturnByRecord = useMemo(() => {
    const result = new Map<number, BlankReturn>()
    returns.forEach((value) => {
      if (value.returnType === 'REJECTED_BLANKS' && value.productionRecordId) {
        result.set(value.productionRecordId, value)
      }
    })
    return result
  }, [returns])
  const rejectedTyreReturnByRecord = useMemo(() => {
    const result = new Map<number, BlankReturn>()
    returns.forEach((value) => {
      if (value.returnType === 'REJECTED_TYRES' && value.productionRecordId) {
        result.set(value.productionRecordId, value)
      }
    })
    return result
  }, [returns])
  const visibleReturns = returns.filter((item) =>
    (!pressFilter || item.pressId === Number(pressFilter))
      && (!statusFilter || item.status === statusFilter))
  const displayedEligibleCarts = eligibleCarts.filter((cart) =>
    !pressFilter || cart.destinationPressId === Number(pressFilter))
  const pressResultTotals = completedRecords.reduce((total, record) => ({
    rejectedTyres: total.rejectedTyres + record.rejectedTyreQuantity,
    rejectedBlanks: total.rejectedBlanks + record.rejectedBlankQuantity,
  }), { rejectedTyres: 0, rejectedBlanks: 0 })
  const unusedBlankTotal = displayedEligibleCarts.reduce(
    (total, cart) => total + cart.remainingQuantity, 0)

  const changePressFilter = (value: string) => {
    setPressFilter(value)
    const next = new URLSearchParams(searchParams)
    if (value) next.set('press', value)
    else next.delete('press')
    setSearchParams(next, { replace: true })
  }

  const selectUnusedForReturn = (record: MouldingProductionRecord) => {
    const cart = eligibleCarts.find((value) => value.id === record.cartId)
    if (!cart) {
      setError('This press record has no unused cart balance available for a new return.')
      return
    }
    const quantity = cart.remainingQuantity
    const measuredWeight = cart.averageBlankWeightGrams
      ? (quantity * Number(cart.averageBlankWeightGrams)) / 1000 : 0
    setPrepare({
      cartId: String(cart.id),
      pressId: String(record.pressId),
      returnType: 'UNUSED_GOOD_BLANKS',
      productionRecordId: String(record.id),
      quantity: String(quantity),
      measuredReturnWeightKg: measuredWeight.toFixed(3),
      returnReason: 'Unused blanks after press production',
      mouldingNote: `Selected from Moulding production record ${record.id}.`,
    })
    setError('')
    document.getElementById('prepare-press-return')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const selectRejectedForReturn = (record: MouldingProductionRecord) => {
    if (record.rejectedBlankQuantity <= 0) {
      setError('This Press Production Entry has no rejected blanks to return.')
      return
    }
    const cart = carts.find((value) => value.id === record.cartId)
    if (!cart) {
      setError('The cart for this Press Production Entry could not be found.')
      return
    }
    const measuredWeight = cart.averageBlankWeightGrams
      ? (record.rejectedBlankQuantity * Number(cart.averageBlankWeightGrams)) / 1000 : 0
    setPrepare({
      cartId: String(cart.id),
      pressId: String(record.pressId),
      returnType: 'REJECTED_BLANKS',
      productionRecordId: String(record.id),
      quantity: String(record.rejectedBlankQuantity),
      measuredReturnWeightKg: measuredWeight.toFixed(3),
      returnReason: 'Rejected blanks from press production',
      mouldingNote: `Rejected material from Moulding production record ${record.id}.`,
    })
    setError('')
    document.getElementById('prepare-press-return')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const selectRejectedTyresForReturn = (record: MouldingProductionRecord) => {
    if (record.rejectedTyreQuantity <= 0) {
      setError('This Press Production Entry has no rejected tyres to return.')
      return
    }
    const cart = carts.find((value) => value.id === record.cartId)
    if (!cart) {
      setError('The cart for this Press Production Entry could not be found.')
      return
    }
    setPrepare({
      cartId: String(cart.id),
      pressId: String(record.pressId),
      returnType: 'REJECTED_TYRES',
      productionRecordId: String(record.id),
      quantity: String(record.rejectedTyreQuantity),
      measuredReturnWeightKg: (Number(record.totalRejectedTyreWeightGrams) / 1000).toFixed(3),
      returnReason: 'Rejected tyres from press production',
      mouldingNote: `Rejected tyres from Moulding production record ${record.id}.`,
    })
    setError('')
    document.getElementById('prepare-press-return')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const prepareReturn = async (event: FormEvent) => {
    event.preventDefault()
    if (!user?.employeeId?.trim()) {
      setError('Your Moulding account must have an EPF/employee number before preparing a return.')
      return
    }
    try {
      await api('/api/moulding/returns', {
        method: 'POST',
        body: JSON.stringify({
          ...prepare,
          cartId: Number(prepare.cartId),
          pressId: Number(prepare.pressId),
          returnType: prepare.returnType,
          productionRecordId: prepare.productionRecordId ? Number(prepare.productionRecordId) : null,
          quantity: Number(prepare.quantity),
          measuredReturnWeightKg: Number(prepare.measuredReturnWeightKg),
        }),
      })
      setPrepare({ ...emptyPrepare, pressId: pressFilter })
      setMessage(prepare.returnType !== 'UNUSED_GOOD_BLANKS'
        ? 'Rejected material recorded for return without increasing usable stock.'
        : 'Unused blanks reserved and return record prepared.')
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const sendReturn = async (value: BlankReturn) => {
    if (!user?.employeeId?.trim()) {
      setError('Your Moulding account must have an EPF/employee number before sending a return.')
      return
    }
    if (!window.confirm(`Send ${value.returnNumber} to Blanking for confirmation?`)) return
    try {
      await api(`/api/moulding/returns/${value.id}/send`, { method: 'POST' })
      setMessage(`${value.returnNumber} sent to Blanking.`)
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const confirmReturn = async (event: FormEvent) => {
    event.preventDefault()
    if (!user?.employeeId?.trim()) {
      setError('Your Blanking account must have an EPF/employee number before receiving a return.')
      return
    }
    try {
      const returnType = selectedConfirmReturn?.returnType ?? 'UNUSED_GOOD_BLANKS'
      await api(`/api/blanking/returns/${confirm.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          receivedQuantity: Number(confirm.receivedQuantity),
          receivedWeightKg: Number(confirm.receivedWeightKg),
          varianceNote: confirm.varianceNote,
          username: confirm.username.trim(),
          employeeId: confirm.employeeId.trim(),
          password: confirm.password,
        }),
      })
      setConfirm(emptyConfirm)
      setMessage(returnType === 'UNUSED_GOOD_BLANKS'
        ? 'Unused blank return verified and usable Blanking inventory updated.'
        : `${returnTypeLabel(returnType)} return verified as rejected material; usable stock was not increased.`)
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Press material control"
        title="Rejects and returns"
        description="Review every press production result, return unused blanks, and physically confirm rejected blanks or tyres with full operator traceability."
        actions={<LiveIndicator connected={connected} />}
      />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

      {canPrepare && (
        <form id="prepare-press-return" onSubmit={prepareReturn} className="card mb-6 scroll-mt-5 p-5">
          <div className="mb-5 flex items-center gap-3"><div className={`grid h-11 w-11 place-items-center rounded-xl ${prepare.returnType !== 'UNUSED_GOOD_BLANKS' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-process'}`}>{prepare.returnType !== 'UNUSED_GOOD_BLANKS' ? <AlertTriangle size={21} /> : <ArrowLeftRight size={21} />}</div><div><h2 className="font-black">Prepare {prepare.returnType === 'REJECTED_TYRES' ? 'rejected tyres' : prepare.returnType === 'REJECTED_BLANKS' ? 'rejected blanks' : 'unused blanks'} for return</h2><p className="text-xs text-slate-500">Official operator, EPF, shift and sending time come from the server.</p></div></div>
          <div className={`mb-5 rounded-xl border p-3 text-sm font-bold ${user?.employeeId ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {user?.employeeId ? `Moulding sender: ${user.fullName} · EPF ${user.employeeId}` : 'Return preparation is blocked: this account has no EPF/employee number.'}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <label><span className="label">Press</span><select className="field" required value={prepare.pressId} onChange={(e) => setPrepare({ ...prepare, pressId: e.target.value, cartId: '', productionRecordId: '', quantity: '', measuredReturnWeightKg: '' })}><option value="">Select press</option>{presses.map((press) => <option key={press.id} value={press.id}>{press.pressNumber}</option>)}</select></label>
            <label className="xl:col-span-2"><span className="label">Cart</span><select className="field" required disabled={prepare.returnType !== 'UNUSED_GOOD_BLANKS'} value={prepare.cartId} onChange={(e) => { const cart = carts.find((item) => item.id === Number(e.target.value)); setPrepare({ ...prepare, cartId: e.target.value, pressId: cart?.destinationPressId ? String(cart.destinationPressId) : prepare.pressId, productionRecordId: '', quantity: '', measuredReturnWeightKg: '' }) }}><option value="">Select received cart</option>{(prepare.returnType !== 'UNUSED_GOOD_BLANKS' && selectedCart ? [selectedCart] : eligibleCartsForPress).map((cart) => <option key={cart.id} value={cart.id}>{cart.cartNumber} · {cart.itemCode ?? cart.materialCode} · {cart.remainingQuantity} available</option>)}</select></label>
            <label><span className="label">Return quantity ({prepare.returnType === 'REJECTED_TYRES' ? 'tyres' : 'pieces'})</span><input className="field" required readOnly={prepare.returnType !== 'UNUSED_GOOD_BLANKS'} type="number" min="1" max={prepare.returnType === 'UNUSED_GOOD_BLANKS' ? selectedCart?.remainingQuantity : Number(prepare.quantity)} value={prepare.quantity} onChange={(e) => setPrepare({ ...prepare, quantity: e.target.value })} /></label>
            <label><span className="label">Recorded return weight (kg)</span><input className="field" required readOnly={prepare.returnType === 'REJECTED_TYRES'} type="number" min="0" step="0.001" value={prepare.measuredReturnWeightKg} onChange={(e) => setPrepare({ ...prepare, measuredReturnWeightKg: e.target.value })} /></label>
            <div className="rounded-xl bg-slate-50 p-3"><span className="label">Expected weight</span><p className="font-black">{calculatedWeight.toFixed(3)} kg</p><p className="text-xs text-slate-500">For receipt comparison</p></div>
            <label className="md:col-span-2 xl:col-span-3"><span className="label">Return reason</span><input className="field" required value={prepare.returnReason} onChange={(e) => setPrepare({ ...prepare, returnReason: e.target.value })} /></label>
            <label className="md:col-span-2 xl:col-span-3"><span className="label">Moulding note</span><input className="field" value={prepare.mouldingNote} onChange={(e) => setPrepare({ ...prepare, mouldingNote: e.target.value })} /></label>
          </div>
          {selectedCart && prepare.returnType !== 'REJECTED_TYRES' && !selectedCart.averageBlankWeightGrams && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">This historical cart has no saved average blank weight. Enter the actual total return weight above; the system will derive and save the per-item weight on this return record.</div>}
          {prepare.returnType !== 'UNUSED_GOOD_BLANKS' && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">{prepare.returnType === 'REJECTED_TYRES' ? 'Rejected tyres' : 'Rejected blanks'} are linked to Press Production Entry #{prepare.productionRecordId}. They are recorded and physically confirmed as rejected material, but they are not restored to usable Blanking stock.</p>}
          <div className="mt-5 flex justify-end"><button className="btn-primary" disabled={!user?.employeeId}>Prepare return</button></div>
        </form>
      )}

      {canViewPressResults && (
        <section className="card mb-6 overflow-hidden" aria-labelledby="press-reject-return-title">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
            <div>
              <h2 id="press-reject-return-title" className="text-lg font-black text-ink">Press rejects and unused blank returns</h2>
              <p className="mt-1 text-xs text-slate-500">Select a press to see its unused and rejected blanks separately. Both can be physically returned, but only unused good blanks restore usable Blanking inventory.</p>
            </div>
            <label className="w-full sm:w-64"><span className="label">Select press</span><select className="field" value={pressFilter} onChange={(event) => changePressFilter(event.target.value)}><option value="">All presses</option>{presses.map((press) => <option key={press.id} value={press.id}>{press.pressNumber} · {press.pressName}</option>)}</select></label>
          </div>
          <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
            <div className="bg-white p-4 sm:px-6"><p className="text-xs font-bold uppercase text-slate-400">Rejected tyres</p><p className="mt-1 text-2xl font-black text-red-700">{pressResultTotals.rejectedTyres.toLocaleString()}</p></div>
            <div className="bg-white p-4 sm:px-6"><p className="text-xs font-bold uppercase text-slate-400">Rejected blanks</p><p className="mt-1 text-2xl font-black text-red-700">{pressResultTotals.rejectedBlanks.toLocaleString()}</p></div>
            <div className="bg-white p-4 sm:px-6"><p className="text-xs font-bold uppercase text-slate-400">Unused blanks available to return</p><p className="mt-1 text-2xl font-black text-amber-700">{unusedBlankTotal.toLocaleString()}</p></div>
          </div>
          {completedRecords.length === 0 ? (
            <EmptyState title="No completed press results" message="Complete a Press Production Entry to record rejects and make any unused blank balance available for return." />
          ) : (
            <div className="overflow-x-auto">
              <table className="production-table min-w-[1650px]">
                <thead><tr><th>Press / cart</th><th>Batch / item</th><th>Good production</th><th>Unused blanks / return</th><th>Rejected blanks / return</th><th>Rejected tyres / return</th><th>Entry operator / EPF</th><th>Date / time</th></tr></thead>
                <tbody>{completedRecords.map((record) => {
                  const returnableCart = eligibleCarts.find((cart) => cart.id === record.cartId)
                  const latestReturn = latestReturnByCart.get(record.cartId)
                  const rejectedReturn = rejectedReturnByRecord.get(record.id)
                  const rejectedTyreReturn = rejectedTyreReturnByRecord.get(record.id)
                  const canSelectUnused = canPrepare && latestCompletedRecordIds.has(record.id) && Boolean(returnableCart)
                  const canSelectRejected = canPrepare && record.rejectedBlankQuantity > 0 && !rejectedReturn
                  const canSelectRejectedTyres = canPrepare && record.rejectedTyreQuantity > 0 && !rejectedTyreReturn
                  return (
                    <tr key={record.id}>
                      <td><p className="font-black">{record.pressNumber}</p><p className="text-xs text-slate-500">Cart {record.cartNumber} · Record #{record.id}</p></td>
                      <td><p className="font-bold">{record.blankingBatchNumber}</p><p className="text-xs text-slate-500">{record.itemCode ?? 'Item TBC'} · {record.compoundCode} / {record.compoundBatchNumber}</p></td>
                      <td><p className="font-bold text-emerald-700">{record.goodTyreQuantity} good tyres</p><p className="text-xs text-slate-500">{record.quantityReceived} blanks entered production</p></td>
                      <td><p className="font-black text-amber-700">{returnableCart?.remainingQuantity ?? 0} unused blanks</p><p className="text-xs text-slate-500">{record.remainingBlankQuantity} remained at completion</p><div className="mt-2 flex flex-col items-start gap-2">{latestReturn?.returnType !== 'REJECTED_BLANKS' && latestReturn ? <StatusBadge status={latestReturn.status} /> : null}{canSelectUnused ? <button type="button" className="btn-primary whitespace-nowrap" onClick={() => selectUnusedForReturn(record)}><RotateCcw size={16} /> Return unused</button> : <span className="text-xs text-slate-400">{latestCompletedRecordIds.has(record.id) ? 'No unused balance' : 'Historical balance'}</span>}</div></td>
                      <td><p className="font-black text-red-700">{record.rejectedBlankQuantity} rejected blanks</p><p className="text-xs text-slate-500">Recorded in production entry #{record.id}</p><div className="mt-2 flex flex-col items-start gap-2">{rejectedReturn ? <><StatusBadge status={rejectedReturn.status} /><span className="text-xs text-slate-500">{rejectedReturn.returnNumber}</span></> : canSelectRejected ? <button type="button" className="btn-secondary whitespace-nowrap border-red-200 text-red-700" onClick={() => selectRejectedForReturn(record)}><AlertTriangle size={16} /> Return rejected</button> : <span className="text-xs text-slate-400">{record.rejectedBlankQuantity > 0 ? 'Recorded' : 'No rejected blanks'}</span>}</div></td>
                      <td><p className="font-black text-red-700">{record.rejectedTyreQuantity} rejected tyres</p><p className="text-xs text-slate-500">{Number(record.totalRejectedTyreWeightGrams).toFixed(3)} g total weight</p><div className="mt-2 flex flex-col items-start gap-2">{rejectedTyreReturn ? <><StatusBadge status={rejectedTyreReturn.status} /><span className="text-xs text-slate-500">{rejectedTyreReturn.returnNumber}</span></> : canSelectRejectedTyres ? <button type="button" className="btn-secondary whitespace-nowrap border-red-200 text-red-700" onClick={() => selectRejectedTyresForReturn(record)}><AlertTriangle size={16} /> Return rejected tyres</button> : <span className="text-xs text-slate-400">{record.rejectedTyreQuantity > 0 ? 'Recorded' : 'No rejected tyres'}</span>}</div></td>
                      <td><p className="font-bold">{record.operator.fullName}</p><p className="text-xs text-slate-500">EPF {record.operatorEmployeeId}</p></td>
                      <td><p className="font-bold">{record.productionDate} · {record.shift.replace('_', ' ')}</p><p className="text-xs text-slate-500">IN {formatDateTime(record.startTime)}<br />OUT {formatDateTime(record.endTime)}</p></td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-lg font-black text-ink">Moulding-to-Blanking return history</h2><p className="text-xs text-slate-500">All three return types are physically confirmed. Only unused good blanks restore usable Blanking stock.</p></div><label className="w-full max-w-xs"><span className="label">Return status</span><select className="field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option>{['RETURN_PREPARED', 'SENT_TO_BLANKING', 'AWAITING_CONFIRMATION', 'QUANTITY_DISPUTED', 'CLOSED'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label></div>
      {visibleReturns.length === 0 ? <EmptyState title="No blank returns" message="Returns prepared by Moulding and confirmed by Blanking will appear here." /> : (
        <div className="table-shell">
          <table>
            <thead><tr><th>Return / type</th><th>Press / cart</th><th>Sent quantity / weight</th><th>Operators / times</th><th>Received / variance</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{visibleReturns.map((value) => (
              <tr key={value.id}>
                <td><p className="font-black">{value.returnNumber}</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase ${value.returnType !== 'UNUSED_GOOD_BLANKS' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{returnTypeLabel(value.returnType)}</span><p className="mt-1 text-xs text-slate-500">{value.compoundBatchNumber} → {value.blankingBatchNumber} · {value.itemCode ?? value.compoundCode}{value.productionRecordId ? ` · Entry #${value.productionRecordId}` : ''}</p></td>
                <td>{value.pressNumber}<p className="text-xs text-slate-500">{value.cartNumber}</p></td>
                <td>{value.preparedQuantity} {returnUnit(value.returnType)}<p className="text-xs text-slate-500">{value.measuredReturnWeightKg} kg · {value.averageBlankWeightGrams} g each</p></td>
                <td><p className="font-bold">Moulding: {value.sendingOperator.fullName}</p><p className="text-xs text-slate-500">EPF {value.sendingOperatorEmployeeId}</p><p className="text-xs text-slate-500">Prepared {formatDateTime(value.createdAt)} · Sent {formatDateTime(value.sendingDateTime)}</p>{value.receivingOperator && <><p className="mt-2 font-bold text-emerald-700">Blanking: {value.receivingOperator.fullName}</p><p className="text-xs text-emerald-700">EPF {value.receivingOperatorEmployeeId ?? value.receivingOperator.employeeId ?? 'TBC'} · Received {formatDateTime(value.receivingDateTime)}</p></>}</td>
                <td>{value.receivedQuantity ?? '—'} {returnUnit(value.returnType)}<p className="text-xs text-slate-500">{value.receivedWeightKg ?? '—'} kg · variance {value.quantityVariance ?? 0} {returnUnit(value.returnType)} / {value.weightVarianceKg ?? 0} kg</p></td>
                <td><StatusBadge status={value.status} /></td>
                <td><div className="flex flex-wrap gap-2">
                  {canPrepare && value.status === 'RETURN_PREPARED' && <button className="btn-primary" onClick={() => sendReturn(value)}><Send size={16} /> Send</button>}
                  {canConfirm && ['SENT_TO_BLANKING', 'AWAITING_CONFIRMATION'].includes(value.status) && <button className="btn-primary" onClick={() => setConfirm({ ...emptyConfirm, id: value.id, receivedQuantity: String(value.preparedQuantity), receivedWeightKg: String(value.measuredReturnWeightKg) })}><CheckCircle2 size={16} /> Confirm</button>}
                  {canResolveVariance && value.status === 'QUANTITY_DISPUTED' && <button className="btn-primary" onClick={() => setConfirm({ ...emptyConfirm, id: value.id, receivedQuantity: String(value.receivedQuantity ?? value.preparedQuantity), receivedWeightKg: String(value.receivedWeightKg ?? value.measuredReturnWeightKg), varianceNote: value.varianceNote ?? '' })}><CheckCircle2 size={16} /> Resolve variance</button>}
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
            <p className="mt-1 text-sm text-slate-500">Enter the quantities physically received in Blanking. Only unused good blanks are restored to usable inventory; rejected blanks remain production loss.</p>
            {selectedConfirmReturn && <><div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"><div><p className="label">Return / Cart</p><p className="font-black">{selectedConfirmReturn.returnNumber} · {selectedConfirmReturn.cartNumber}</p><p className="text-xs text-slate-500">{selectedConfirmReturn.pressNumber} → {selectedConfirmReturn.blankingBatchNumber} · {returnTypeLabel(selectedConfirmReturn.returnType)}</p></div><div><p className="label">Moulding sender</p><p className="font-black">{selectedConfirmReturn.sendingOperator.fullName}</p><p className="text-xs text-slate-500">EPF {selectedConfirmReturn.sendingOperatorEmployeeId}</p></div></div>{selectedConfirmReturn.returnType !== 'UNUSED_GOOD_BLANKS' && <div className="mt-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800"><AlertTriangle className="shrink-0" size={19} /><p>This receipt confirms {returnTypeLabel(selectedConfirmReturn.returnType).toLowerCase()} only. It will not increase usable Blanking stock.</p></div>}</>}
            <div className={`mt-4 rounded-xl border p-3 text-sm font-bold ${user?.employeeId ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {user?.employeeId ? `Blanking receiver: ${user.fullName} · EPF ${user.employeeId}` : 'Receipt is blocked: this account has no EPF/employee number.'}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label><span className="label">Received quantity ({selectedConfirmReturn ? returnUnit(selectedConfirmReturn.returnType) : 'items'})</span><input className="field" required type="number" min="0" value={confirm.receivedQuantity} onChange={(e) => setConfirm({ ...confirm, receivedQuantity: e.target.value })} /></label>
              <label><span className="label">Received weight (kg)</span><input className="field" required type="number" min="0" step="0.001" value={confirm.receivedWeightKg} onChange={(e) => setConfirm({ ...confirm, receivedWeightKg: e.target.value })} /></label>
              <label className="sm:col-span-2"><span className="label">Variance note (required if different)</span><textarea className="field min-h-24" value={confirm.varianceNote} onChange={(e) => setConfirm({ ...confirm, varianceNote: e.target.value })} /></label>
            </div>
            <fieldset className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
              <legend className="px-2 text-xs font-black uppercase tracking-wider text-process">Operator credential confirmation</legend>
              <p className="mb-4 text-xs text-slate-600">Type the credentials of your currently logged-in account. They are checked securely by the server and the password is not stored.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2"><span className="label">Username / email</span><input className="field bg-white" required type="email" autoComplete="username" maxLength={255} value={confirm.username} onChange={(e) => setConfirm({ ...confirm, username: e.target.value })} placeholder="operator@stellana.local" /></label>
                <label><span className="label">EPF No.</span><input className="field bg-white font-bold uppercase" required maxLength={50} autoComplete="off" value={confirm.employeeId} onChange={(e) => setConfirm({ ...confirm, employeeId: e.target.value })} placeholder="BLK-001" /></label>
                <label><span className="label">Password</span><input className="field bg-white" required type="password" autoComplete="current-password" maxLength={255} value={confirm.password} onChange={(e) => setConfirm({ ...confirm, password: e.target.value })} /></label>
              </div>
            </fieldset>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setConfirm(emptyConfirm)}>Cancel</button><button className="btn-primary" disabled={!user?.employeeId || !confirm.username.trim() || !confirm.employeeId.trim() || !confirm.password}>Verify credentials & confirm receipt</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
