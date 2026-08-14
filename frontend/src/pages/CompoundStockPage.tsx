import type { FormEvent } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { ArrowLeftRight, Boxes, CheckCircle2, ChevronDown, ChevronRight, FlaskConical, PackageCheck, Scale, Search } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime } from '../lib/api'
import type { ApprovedMaterialBatch, BlankReturn } from '../types'

const TOPICS = ['/topic/blanking', '/topic/moulding', '/topic/production'] as const
const COMPOUNDS_PER_PAGE = 8
const emptyReceiptUpdate = { id: 0, mixingBatchNumber: '', materialCode: '', currentReceived: 0, currentAvailable: 0, receivedQuantityKg: '', reason: '' }
const emptyReturnConfirm = { id: 0, receivedQuantity: '', receivedWeightKg: '', varianceNote: '' }

interface CompoundStockGroup {
  key: string
  materialCode: string
  compoundName: string
  batches: ApprovedMaterialBatch[]
  received: number
  available: number
  reserved: number
  consumed: number
  returned: number
}

const stockAmount = (value: number) => `${Number(value).toFixed(3)} kg`

export function CompoundStockPage() {
  const { user } = useAuth()
  const canControl = ['BLANKING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canUpdateReceipt = user?.role === 'SYSTEM_ADMIN'
  const canReceiveReturns = ['BLANKING_OPERATOR', 'BLANKING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canResolveReturnVariance = ['BLANKING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const [stock, setStock] = useState<ApprovedMaterialBatch[]>([])
  const [blankReturns, setBlankReturns] = useState<BlankReturn[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savingReceipt, setSavingReceipt] = useState(false)
  const [receiptUpdate, setReceiptUpdate] = useState(emptyReceiptUpdate)
  const [returnConfirm, setReturnConfirm] = useState(emptyReturnConfirm)
  const [compoundSearch, setCompoundSearch] = useState('')
  const [compoundPage, setCompoundPage] = useState(1)
  const [expandedCompounds, setExpandedCompounds] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const [stockValues, returnValues] = await Promise.all([
        api<ApprovedMaterialBatch[]>('/api/blanking/compound-stock'),
        api<BlankReturn[]>('/api/blanking/returns'),
      ])
      setStock(stockValues)
      setBlankReturns(returnValues)
      setError('')
    } catch (reason) {
      setError(displayError(reason))
    }
  }, [])
  const connected = useRealtimeRefresh(load, TOPICS)
  const selectedReturn = useMemo(
    () => blankReturns.find((value) => value.id === returnConfirm.id),
    [blankReturns, returnConfirm.id],
  )
  const compoundGroups = useMemo(() => {
    const groups = new Map<string, CompoundStockGroup>()
    stock.forEach((item) => {
      const key = `${item.materialCode.trim().toLocaleLowerCase()}::${item.compoundName.trim().toLocaleLowerCase()}`
      const current = groups.get(key) ?? {
        key,
        materialCode: item.materialCode,
        compoundName: item.compoundName,
        batches: [],
        received: 0,
        available: 0,
        reserved: 0,
        consumed: 0,
        returned: 0,
      }
      current.batches.push(item)
      current.received += Number(item.receivedQuantityKg)
      current.available += Number(item.availableQuantityKg)
      current.reserved += Number(item.reservedQuantityKg)
      current.consumed += Number(item.consumedQuantityKg)
      current.returned += Number(item.returnedQuantityKg)
      groups.set(key, current)
    })
    const query = compoundSearch.trim().toLocaleLowerCase()
    return Array.from(groups.values())
      .filter((group) => !query
        || group.materialCode.toLocaleLowerCase().includes(query)
        || group.compoundName.toLocaleLowerCase().includes(query)
        || group.batches.some((batch) => batch.mixingBatchNumber.toLocaleLowerCase().includes(query)))
      .sort((left, right) => left.materialCode.localeCompare(right.materialCode, undefined, { numeric: true }))
  }, [compoundSearch, stock])
  const compoundPageCount = Math.max(1, Math.ceil(compoundGroups.length / COMPOUNDS_PER_PAGE))
  const visibleCompoundGroups = compoundGroups.slice(
    (Math.min(compoundPage, compoundPageCount) - 1) * COMPOUNDS_PER_PAGE,
    Math.min(compoundPage, compoundPageCount) * COMPOUNDS_PER_PAGE,
  )
  const returnedBlankTotals = blankReturns.reduce((total, value) => {
    if (value.returnType !== 'UNUSED_GOOD_BLANKS') return total
    if (value.status === 'CLOSED') {
      total.confirmedPieces += value.receivedQuantity ?? 0
      total.confirmedWeightKg += Number(value.receivedWeightKg ?? 0)
    } else if (['SENT_TO_BLANKING', 'AWAITING_CONFIRMATION', 'QUANTITY_DISPUTED'].includes(value.status)) {
      total.awaitingPieces += value.preparedQuantity
    }
    return total
  }, { confirmedPieces: 0, confirmedWeightKg: 0, awaitingPieces: 0 })
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
  const toggleCompound = (key: string) => {
    setExpandedCompounds((values) => values.includes(key)
      ? values.filter((value) => value !== key)
      : [...values, key])
  }
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

  const confirmBlankReturn = async (event: FormEvent) => {
    event.preventDefault()
    if (!user?.employeeId?.trim()) {
      setError('Your Blanking account must have an EPF/employee number before receiving returned blanks.')
      return
    }
    setError('')
    setMessage('')
    try {
      await api(`/api/blanking/returns/${returnConfirm.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          receivedQuantity: Number(returnConfirm.receivedQuantity),
          receivedWeightKg: Number(returnConfirm.receivedWeightKg),
          varianceNote: returnConfirm.varianceNote.trim(),
        }),
      })
      setMessage('Returned blanks received. The originating Blanking batch stock and return history were updated together.')
      setReturnConfirm(emptyReturnConfirm)
      await load()
    } catch (value) {
      setError(displayError(value))
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

      <section className="card mb-6 overflow-hidden" aria-labelledby="compound-wise-stock-title">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 bg-blue-50/60 px-5 py-4 sm:px-6">
          <div>
            <h2 id="compound-wise-stock-title" className="text-lg font-black text-ink">Compound-wise stock table</h2>
            <p className="mt-1 text-xs text-slate-500">One row per compound. Expand a compound to view and update its exact Mixing batch records.</p>
          </div>
          <label className="w-full max-w-sm">
            <span className="label">Find compound or batch</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                className="field pl-10"
                type="search"
                value={compoundSearch}
                onChange={(event) => {
                  setCompoundSearch(event.target.value)
                  setCompoundPage(1)
                }}
                placeholder="Compound code, name or batch no."
              />
            </span>
          </label>
        </div>
        {stock.length === 0 ? <EmptyState title="No released compound stock" message="A Mixing batch appears after a laboratory PASS or an authorized temporary lab-bypass release to Blanking." /> : compoundGroups.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm font-bold text-slate-500">No compound stock matches “{compoundSearch}”.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="production-table min-w-[1050px]">
                <thead><tr><th>Compound type</th><th>Mixing batches</th><th>Total received</th><th>Available stock</th><th>Reserved</th><th>Consumed / returned</th><th>Batch status</th></tr></thead>
                <tbody>{visibleCompoundGroups.map((group) => {
                  const expanded = expandedCompounds.includes(group.key)
                  const statuses = Array.from(new Set(group.batches.map((batch) => batch.stockStatus)))
                  return [
                    <tr key={group.key} className="bg-white">
                      <td>
                        <button type="button" className="flex min-w-52 items-center gap-3 text-left" onClick={() => toggleCompound(group.key)} aria-expanded={expanded}>
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-100 text-process">{expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</span>
                          <span><span className="block font-black text-ink">{group.materialCode}</span><span className="block text-xs text-slate-500">{group.compoundName}</span></span>
                        </button>
                      </td>
                      <td><span className="font-black">{group.batches.length}</span><p className="text-xs text-slate-500">traceable batch record{group.batches.length === 1 ? '' : 's'}</p></td>
                      <td className="font-bold">{stockAmount(group.received)}</td>
                      <td><span className="text-base font-black text-emerald-700">{stockAmount(group.available)}</span></td>
                      <td><span className="font-bold text-amber-700">{stockAmount(group.reserved)}</span></td>
                      <td><span className="font-bold">{stockAmount(group.consumed)}</span><p className="text-xs text-slate-500">{stockAmount(group.returned)} returned</p></td>
                      <td><div className="flex max-w-52 flex-wrap gap-1">{statuses.map((status) => <StatusBadge key={status} status={status} />)}</div></td>
                    </tr>,
                    expanded && <tr key={`${group.key}-details`} className="bg-slate-50/80">
                      <td colSpan={7} className="p-0">
                        <div className="border-y border-blue-100 px-5 py-4 sm:px-8">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div><p className="font-black text-ink">{group.materialCode} batch details</p><p className="text-xs text-slate-500">Quantity corrections apply only to the selected Mixing batch and are recorded in the audit history.</p></div>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">{group.batches.length} batch{group.batches.length === 1 ? '' : 'es'}</span>
                          </div>
                          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <table className="production-table min-w-[1250px]">
                              <thead><tr><th>Mixing batch no.</th><th>Lab approval</th><th>Required / received</th><th>Available / reserved</th><th>Consumed / returned</th><th>Received by / time</th><th>Status</th>{canControl && <th>Stock status update</th>}{canUpdateReceipt && <th>Quantity update</th>}</tr></thead>
                              <tbody>{group.batches.map((item) => (
                                <tr key={item.id}>
                                  <td><p className="font-black">{item.mixingBatchNumber}</p><p className="text-xs text-slate-500">Stock record #{item.id}</p></td>
                                  <td>
                                    {item.temporaryLabBypass ? <StatusBadge status="TEMPORARY_LAB_BYPASS" /> : <StatusBadge status={item.labStatus} />}
                                    {item.temporaryLabBypass ? <p className="mt-1 max-w-64 text-xs text-amber-800">Authorized by {item.temporaryLabBypassApprovedBy?.fullName ?? 'management'} · {formatDateTime(item.temporaryLabBypassApprovedAt)}</p> : <p className="mt-1 text-xs text-slate-500">Ref #{item.labApprovalId ?? 'TBC'}</p>}
                                  </td>
                                  <td>{stockAmount(item.plannedQuantityKg)}<p className="text-xs text-slate-500">{stockAmount(item.receivedQuantityKg)} received</p></td>
                                  <td><span className="font-black text-emerald-700">{stockAmount(item.availableQuantityKg)}</span><p className="text-xs text-amber-700">{stockAmount(item.reservedQuantityKg)} reserved</p></td>
                                  <td>{stockAmount(item.consumedQuantityKg)}<p className="text-xs text-slate-500">{stockAmount(item.returnedQuantityKg)} returned</p></td>
                                  <td>{item.stockStatus === 'AWAITING_RECEIPT' ? 'Awaiting receipt' : item.receivingOperator?.fullName ?? 'System release'}<p className="text-xs text-slate-500">{formatDateTime(item.receivedAt)}</p></td>
                                  <td><StatusBadge status={item.stockStatus} /></td>
                                  {canControl && <td><select className="field min-w-36" value={item.stockStatus === 'PARTIALLY_USED' ? 'AVAILABLE' : item.stockStatus} onChange={(event) => void changeStatus(item, event.target.value as 'AVAILABLE' | 'ON_HOLD' | 'REJECTED')}><option value="AVAILABLE">Available</option><option value="ON_HOLD">On hold</option><option value="REJECTED">Rejected</option>{item.stockStatus === 'DEPLETED' && <option value="DEPLETED" disabled>Depleted</option>}{item.stockStatus === 'AWAITING_RECEIPT' && <option value="AWAITING_RECEIPT" disabled>Awaiting receipt</option>}</select></td>}
                                  {canUpdateReceipt && <td><button type="button" className="btn-secondary whitespace-nowrap" onClick={() => openReceiptUpdate(item)}><PackageCheck size={16} /> {item.stockStatus === 'AWAITING_RECEIPT' ? 'Receive compound' : 'Update quantity'}</button></td>}
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>,
                  ]
                })}</tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm sm:px-6">
              <p className="text-slate-500">Showing {((Math.min(compoundPage, compoundPageCount) - 1) * COMPOUNDS_PER_PAGE) + 1}–{Math.min(Math.min(compoundPage, compoundPageCount) * COMPOUNDS_PER_PAGE, compoundGroups.length)} of {compoundGroups.length} compounds</p>
              <div className="flex gap-2"><button type="button" className="btn-secondary" disabled={compoundPage <= 1} onClick={() => setCompoundPage((page) => Math.max(1, page - 1))}>Previous</button><button type="button" className="btn-secondary" disabled={compoundPage >= compoundPageCount} onClick={() => setCompoundPage((page) => Math.min(compoundPageCount, page + 1))}>Next</button></div>
            </div>
          </>
        )}
      </section>

      <section className="card mb-6 overflow-hidden" aria-labelledby="returned-blanks-title">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-emerald-50/60 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><ArrowLeftRight size={21} /></div>
            <div><h2 id="returned-blanks-title" className="font-black text-ink">Returned blanks from Moulding</h2><p className="mt-1 text-xs text-slate-500">Connected to the physical cart return. Confirmed pieces are restored to the originating Blanking batch; they are shown separately from raw compound kilograms.</p></div>
          </div>
          <LiveIndicator connected={connected} />
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
          <div className="bg-white p-4 sm:px-6"><p className="text-xs font-bold uppercase text-slate-400">Awaiting Blanking receipt</p><p className="mt-1 text-2xl font-black text-amber-700">{returnedBlankTotals.awaitingPieces.toLocaleString()} <span className="text-sm">pieces</span></p></div>
          <div className="bg-white p-4 sm:px-6"><p className="text-xs font-bold uppercase text-slate-400">Confirmed returned stock</p><p className="mt-1 text-2xl font-black text-emerald-700">{returnedBlankTotals.confirmedPieces.toLocaleString()} <span className="text-sm">pieces</span></p></div>
          <div className="bg-white p-4 sm:px-6"><p className="text-xs font-bold uppercase text-slate-400">Confirmed return weight</p><p className="mt-1 text-2xl font-black text-emerald-700">{returnedBlankTotals.confirmedWeightKg.toFixed(3)} <span className="text-sm">kg</span></p></div>
        </div>
        {blankReturns.length === 0 ? <p className="px-5 py-6 text-sm text-slate-500">No Moulding-to-Blanking returns are recorded.</p> : (
          <div className="overflow-x-auto">
            <table className="production-table">
              <thead><tr><th>Return / Cart</th><th>Compound / Blanking batch</th><th>Press / quantity</th><th>Moulding sender</th><th>Blanking receiver</th><th>Status / receive</th></tr></thead>
              <tbody>{blankReturns.map((value) => {
                const canConfirmThis = canReceiveReturns && ['SENT_TO_BLANKING', 'AWAITING_CONFIRMATION'].includes(value.status)
                const canResolveThis = canResolveReturnVariance && value.status === 'QUANTITY_DISPUTED'
                return <tr key={value.id}>
                  <td><p className="font-black">{value.returnNumber}</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase ${value.returnType !== 'UNUSED_GOOD_BLANKS' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{value.returnType === 'REJECTED_TYRES' ? 'Rejected tyres' : value.returnType === 'REJECTED_BLANKS' ? 'Rejected blanks' : 'Unused good blanks'}</span><p className="mt-1 text-xs text-slate-500">Cart {value.cartNumber} · {value.itemCode ?? 'Item TBC'}</p></td>
                  <td><p className="font-bold">{value.compoundCode} · {value.compoundBatchNumber}</p><p className="text-xs text-slate-500">Blanking batch {value.blankingBatchNumber}</p></td>
                  <td><p className="font-bold">{value.pressNumber}</p><p className="text-xs text-slate-500">{value.preparedQuantity} pieces · {Number(value.measuredReturnWeightKg).toFixed(3)} kg</p></td>
                  <td><p className="font-bold">{value.sendingOperator.fullName}</p><p className="text-xs text-slate-500">EPF {value.sendingOperatorEmployeeId} · {formatDateTime(value.sendingDateTime)}</p></td>
                  <td>{value.receivingOperator ? <><p className="font-bold text-emerald-700">{value.receivingOperator.fullName}</p><p className="text-xs text-slate-500">EPF {value.receivingOperatorEmployeeId ?? value.receivingOperator.employeeId ?? 'TBC'} · {formatDateTime(value.receivingDateTime)}</p><p className="text-xs text-emerald-700">{value.receivedQuantity ?? 0} pieces · {Number(value.receivedWeightKg ?? 0).toFixed(3)} kg received</p></> : <span className="text-xs font-bold text-amber-700">Awaiting physical receipt</span>}</td>
                  <td><StatusBadge status={value.status} />{(canConfirmThis || canResolveThis) && <button type="button" className="btn-primary mt-2 whitespace-nowrap" onClick={() => setReturnConfirm({ id: value.id, receivedQuantity: String(value.receivedQuantity ?? value.preparedQuantity), receivedWeightKg: String(value.receivedWeightKg ?? value.measuredReturnWeightKg), varianceNote: value.varianceNote ?? '' })}><CheckCircle2 size={16} /> {canResolveThis ? 'Resolve variance' : 'Receive returned blanks'}</button>}</td>
                </tr>
              })}</tbody>
            </table>
          </div>
        )}
      </section>

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

      {returnConfirm.id > 0 && selectedReturn && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4 backdrop-blur-sm">
          <form onSubmit={confirmBlankReturn} className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><PackageCheck size={21} /></div><div><h2 className="text-xl font-black">Receive returned blanks</h2><p className="text-sm text-slate-500">{selectedReturn.returnNumber} · Cart {selectedReturn.cartNumber}</p></div></div>
            <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
              <div><p className="label">From Moulding</p><p className="font-black">{selectedReturn.pressNumber} · {selectedReturn.sendingOperator.fullName}</p><p className="text-xs text-slate-500">EPF {selectedReturn.sendingOperatorEmployeeId}</p></div>
              <div><p className="label">Into Blanking stock</p><p className="font-black">Batch {selectedReturn.blankingBatchNumber}</p><p className="text-xs text-slate-500">{selectedReturn.compoundCode} · {selectedReturn.compoundBatchNumber}</p></div>
            </div>
            <div className={`mt-4 rounded-xl border p-3 text-sm font-bold ${user?.employeeId ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{user?.employeeId ? `Blanking receiver: ${user.fullName} · EPF ${user.employeeId}` : 'Receipt is blocked: this account has no EPF/employee number.'}</div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label><span className="label">Physically received pieces</span><input className="field" required type="number" min="0" value={returnConfirm.receivedQuantity} onChange={(event) => setReturnConfirm({ ...returnConfirm, receivedQuantity: event.target.value })} /></label>
              <label><span className="label">Physically received weight (kg)</span><input className="field" required type="number" min="0" step="0.001" value={returnConfirm.receivedWeightKg} onChange={(event) => setReturnConfirm({ ...returnConfirm, receivedWeightKg: event.target.value })} /></label>
              <label className="sm:col-span-2"><span className="label">Variance note (required if different)</span><textarea className="field min-h-24" value={returnConfirm.varianceNote} onChange={(event) => setReturnConfirm({ ...returnConfirm, varianceNote: event.target.value })} /></label>
            </div>
            <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">One confirmation updates the return record, Cart return history, inventory ledger and the originating Blanking batch’s available-good-blank stock.</p>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setReturnConfirm(emptyReturnConfirm)}>Cancel</button><button className="btn-primary" disabled={!user?.employeeId}>Confirm returned stock</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
