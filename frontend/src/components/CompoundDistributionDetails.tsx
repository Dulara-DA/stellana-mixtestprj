import { Factory, History, PackageCheck, RefreshCw, RotateCcw, Scale, Truck } from 'lucide-react'
import { useMemo } from 'react'
import { StatusBadge } from './StatusBadge'
import { formatDateTime } from '../lib/api'
import type { BlankingCart, ProductionGenealogy } from '../types'

interface CompoundDistributionDetailsProps {
  genealogy: ProductionGenealogy
  refreshing: boolean
  onRefresh: () => void
}

const kg = (value: number) => `${Number(value).toFixed(3)} kg`

const currentCartWeight = (cart: BlankingCart) => {
  if (cart.averageBlankWeightGrams != null) {
    return (cart.remainingQuantity * Number(cart.averageBlankWeightGrams)) / 1000
  }
  if (cart.materialWeightKg != null && cart.quantity > 0) {
    return (Number(cart.materialWeightKg) * cart.remainingQuantity) / cart.quantity
  }
  return 0
}

const cartLocation = (cart: BlankingCart) => {
  if (['PREPARED', 'READY_FOR_DISPATCH', 'HELD'].includes(cart.status)) return 'Blanking / awaiting dispatch'
  if (cart.status === 'DISPATCHED') return 'In transit to Moulding'
  if (['RECEIVED_AT_MOULDING', 'IN_USE', 'PARTIALLY_CONSUMED'].includes(cart.status)) {
    return cart.destinationPressNumber ? `Moulding / ${cart.destinationPressNumber}` : 'Moulding production'
  }
  if (cart.status === 'FULLY_CONSUMED') return 'Consumed in Moulding'
  if (cart.status === 'RETURN_PENDING') return 'Return in progress'
  if (cart.status === 'RETURNED_TO_BLANKING') return 'Returned to Blanking'
  return 'Closed'
}

export function CompoundDistributionDetails({ genealogy, refreshing, onRefresh }: CompoundDistributionDetailsProps) {
  const stock = genealogy.compoundStock
  const receiptByCart = useMemo(
    () => new Map(genealogy.receipts.map((receipt) => [receipt.cartId, receipt])),
    [genealogy.receipts],
  )
  const recordsByCart = useMemo(() => {
    const values = new Map<number, ProductionGenealogy['productionRecords']>()
    genealogy.productionRecords.forEach((record) => {
      values.set(record.cartId, [...(values.get(record.cartId) ?? []), record])
    })
    return values
  }, [genealogy.productionRecords])
  const returnsByCart = useMemo(() => {
    const values = new Map<number, ProductionGenealogy['returns']>()
    genealogy.returns.forEach((value) => {
      values.set(value.cartId, [...(values.get(value.cartId) ?? []), value])
    })
    return values
  }, [genealogy.returns])
  const distribution = useMemo(() => {
    const totals = {
      readyAtBlankingKg: 0,
      dispatchedKg: 0,
      atMouldingKg: 0,
      goodTyres: 0,
      rejectedTyres: 0,
      rejectedBlanks: 0,
    }
    genealogy.carts.forEach((cart) => {
      const currentWeight = currentCartWeight(cart)
      if (['PREPARED', 'READY_FOR_DISPATCH', 'HELD'].includes(cart.status)) totals.readyAtBlankingKg += currentWeight
      if (cart.status === 'DISPATCHED') totals.dispatchedKg += currentWeight
      if (['RECEIVED_AT_MOULDING', 'IN_USE', 'PARTIALLY_CONSUMED'].includes(cart.status)) totals.atMouldingKg += currentWeight
    })
    genealogy.productionRecords.forEach((record) => {
      totals.goodTyres += record.goodTyreQuantity
      totals.rejectedTyres += record.rejectedTyreQuantity
      totals.rejectedBlanks += record.rejectedBlankQuantity
    })
    return totals
  }, [genealogy.carts, genealogy.productionRecords])
  const reconciliation = Number(stock.receivedQuantityKg)
    - Number(stock.availableQuantityKg)
    - Number(stock.reservedQuantityKg)
    - Number(stock.consumedQuantityKg)

  return (
    <div className="border-y border-blue-100 bg-slate-50/80 px-4 py-5 sm:px-7">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-black text-ink">Quantity distribution for {stock.materialCode} · Batch {stock.mixingBatchNumber}</p>
          <p className="mt-1 text-xs text-slate-600">The remaining stock is reduced when compound is issued to Blanking. That allocated quantity is then traced through Blanking carts, Moulding production, and returns without being deducted twice.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={onRefresh} disabled={refreshing} aria-label={`Refresh distribution for batch ${stock.mixingBatchNumber}`}>
          <RefreshCw className={refreshing ? 'animate-spin' : ''} size={16} /> {refreshing ? 'Refreshing…' : 'Refresh trace'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3"><p className="text-[11px] font-black uppercase text-blue-700">Original received</p><p className="mt-1 text-xl font-black text-ink">{kg(stock.receivedQuantityKg)}</p></div>
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3"><p className="text-[11px] font-black uppercase text-emerald-700">Remaining compound stock</p><p className="mt-1 text-xl font-black text-emerald-800">{kg(stock.availableQuantityKg)}</p><p className="text-[11px] text-emerald-700">Current usable balance</p></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[11px] font-black uppercase text-amber-700">Allocated to Blanking</p><p className="mt-1 text-xl font-black text-amber-800">{kg(stock.reservedQuantityKg)}</p><p className="text-[11px] text-amber-700">Issued but not completed</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[11px] font-black uppercase text-slate-500">Processed in Blanking</p><p className="mt-1 text-xl font-black text-slate-800">{kg(stock.consumedQuantityKg)}</p><p className="text-[11px] text-slate-500">{kg(stock.returnedQuantityKg)} returned historically</p></div>
        <div className={`rounded-xl border p-3 ${Math.abs(reconciliation) <= 0.001 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}><p className="text-[11px] font-black uppercase text-slate-500">Stock reconciliation</p><p className={`mt-1 text-xl font-black ${Math.abs(reconciliation) <= 0.001 ? 'text-emerald-800' : 'text-red-700'}`}>{kg(reconciliation)}</p><p className="text-[11px] text-slate-500">Received − available − reserved − processed</p></div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-xl bg-white p-3 shadow-sm"><PackageCheck className="mb-2 text-process" size={18} /><p className="text-xs text-slate-500">Blanks ready at Blanking</p><p className="font-black">{kg(distribution.readyAtBlankingKg)}</p></div>
        <div className="rounded-xl bg-white p-3 shadow-sm"><Truck className="mb-2 text-amber-600" size={18} /><p className="text-xs text-slate-500">Dispatched / in transit</p><p className="font-black">{kg(distribution.dispatchedKg)}</p></div>
        <div className="rounded-xl bg-white p-3 shadow-sm"><Factory className="mb-2 text-blue-700" size={18} /><p className="text-xs text-slate-500">Blanks at Moulding</p><p className="font-black">{kg(distribution.atMouldingKg)}</p></div>
        <div className="rounded-xl bg-white p-3 shadow-sm"><Scale className="mb-2 text-emerald-700" size={18} /><p className="text-xs text-slate-500">Good tyres recorded</p><p className="font-black">{distribution.goodTyres.toLocaleString()}</p></div>
        <div className="rounded-xl bg-white p-3 shadow-sm"><Scale className="mb-2 text-red-700" size={18} /><p className="text-xs text-slate-500">Rejected tyres / blanks</p><p className="font-black">{distribution.rejectedTyres.toLocaleString()} / {distribution.rejectedBlanks.toLocaleString()}</p></div>
        <div className="rounded-xl bg-white p-3 shadow-sm"><RotateCcw className="mb-2 text-violet-700" size={18} /><p className="text-xs text-slate-500">Return records</p><p className="font-black">{genealogy.returns.length.toLocaleString()}</p></div>
      </div>

      <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby={`blanking-allocation-${stock.id}`}>
        <div className="border-b border-slate-200 px-4 py-3"><h3 id={`blanking-allocation-${stock.id}`} className="font-black text-ink">Blanking allocation</h3><p className="text-xs text-slate-500">Compound issued, processed, returned, and converted into blanks.</p></div>
        {genealogy.blankingBatches.length === 0 ? <p className="p-4 text-sm text-slate-500">No quantity has been issued to a Blanking batch.</p> : <div className="overflow-x-auto"><table className="production-table min-w-[1050px]"><thead><tr><th>Blanking batch</th><th>Compound issued</th><th>Used / rejected / returned</th><th>Blank output</th><th>Status</th><th>Operator / EPF</th><th>IN / OUT</th></tr></thead><tbody>{genealogy.blankingBatches.map((batch) => <tr key={batch.id}><td><p className="font-black">{batch.batchNumber}</p><p className="text-xs text-slate-500">{batch.itemCode ?? 'Item TBC'} · {batch.shift.replace('_', ' ')}</p></td><td className="font-bold">{kg(batch.materialConsumedKg)}</td><td><p>{kg(batch.actualUsedCompoundWeightKg)} used</p><p className="text-xs text-red-600">{kg(batch.rejectedMaterialWeightKg)} rejected</p><p className="text-xs text-slate-500">{kg(batch.remainingCompoundWeightKg)} returned</p></td><td><p className="font-bold">{batch.actualGoodBlankQuantity.toLocaleString()} good blanks</p><p className="text-xs text-slate-500">{batch.availableGoodBlankQuantity.toLocaleString()} still at Blanking · {batch.assignedToCartsQuantity.toLocaleString()} assigned</p></td><td><StatusBadge status={batch.status} /></td><td><p className="font-bold">{batch.operator.fullName}</p><p className="text-xs text-slate-500">EPF {batch.operatorEmployeeId}</p></td><td><p className="text-xs">IN {formatDateTime(batch.startTime)}</p><p className="text-xs">OUT {formatDateTime(batch.endTime)}</p></td></tr>)}</tbody></table></div>}
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby={`cart-distribution-${stock.id}`}>
        <div className="border-b border-slate-200 px-4 py-3"><h3 id={`cart-distribution-${stock.id}`} className="font-black text-ink">Cart and Moulding distribution</h3><p className="text-xs text-slate-500">Each cart’s current location, dispatch, receipt, and press-production history.</p></div>
        {genealogy.carts.length === 0 ? <p className="p-4 text-sm text-slate-500">No carts have been created from this compound batch.</p> : <div className="overflow-x-auto"><table className="production-table min-w-[1500px]"><thead><tr><th>Cart / item</th><th>Quantity / weight</th><th>Current location</th><th>Prepared by</th><th>Dispatch</th><th>Moulding receipt</th><th>Press production</th><th>Returns</th></tr></thead><tbody>{genealogy.carts.map((cart) => {
          const receipt = receiptByCart.get(cart.id)
          const records = recordsByCart.get(cart.id) ?? []
          const returns = returnsByCart.get(cart.id) ?? []
          return <tr key={cart.id}><td><p className="font-black">{cart.cartNumber}</p><p className="text-xs text-slate-500">{cart.itemCode ?? 'Item TBC'} · {cart.blankingBatchNumber}</p></td><td><p className="font-bold">{cart.quantity.toLocaleString()} blanks · {kg(Number(cart.materialWeightKg ?? 0))}</p><p className="text-xs text-slate-500">{cart.remainingQuantity.toLocaleString()} remaining · {kg(currentCartWeight(cart))}</p></td><td><p className="font-bold">{cartLocation(cart)}</p><StatusBadge status={cart.status} /><p className="mt-1 text-xs text-slate-500">{cart.destinationPressNumber ?? 'Press not assigned'}</p></td><td><p className="font-bold">{cart.createdBy.fullName}</p><p className="text-xs text-slate-500">EPF {cart.createdBy.employeeId ?? 'TBC'} · {formatDateTime(cart.createdAt)}</p></td><td>{cart.dispatchedAt ? <><p className="font-bold">{cart.dispatchedBy?.fullName ?? 'Recorded operator'}</p><p className="text-xs text-slate-500">EPF {cart.dispatchedBy?.employeeId ?? 'TBC'} · {formatDateTime(cart.dispatchedAt)}</p></> : <span className="text-xs font-bold text-amber-700">Not dispatched</span>}</td><td>{receipt ? <><p className="font-bold">{receipt.receivingOperator.fullName}</p><p className="text-xs text-slate-500">EPF {receipt.receivingOperatorEmployeeId} · {receipt.pressNumber}</p><p className="text-xs text-slate-500">{formatDateTime(receipt.receivedAt)}</p></> : <span className="text-xs text-slate-500">Not received</span>}</td><td>{records.length === 0 ? <span className="text-xs text-slate-500">Not started</span> : records.map((record) => <div key={record.id} className="mb-2 last:mb-0"><p className="font-bold">Entry #{record.id} · {record.pressNumber}</p><p className="text-xs text-slate-500">{record.operator.fullName} · EPF {record.operatorEmployeeId}</p><p className="text-xs text-slate-500">IN {formatDateTime(record.startTime)} · OUT {formatDateTime(record.endTime)}</p><p className="text-xs">{record.goodTyreQuantity} good · {record.rejectedTyreQuantity} rejected tyres · {record.rejectedBlankQuantity} rejected blanks</p></div>)}</td><td>{returns.length === 0 ? <span className="text-xs text-slate-500">No returns</span> : returns.map((value) => <div key={value.id} className="mb-2 last:mb-0"><p className="font-bold">{value.returnNumber}</p><p className="text-xs text-slate-500">{value.preparedQuantity} {value.returnType === 'REJECTED_TYRES' ? 'tyres' : 'pieces'} · {value.returnType.replaceAll('_', ' ')}</p><StatusBadge status={value.status} /></div>)}</td></tr>
        })}</tbody></table></div>}
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby={`movement-history-${stock.id}`}>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3"><History className="text-process" size={19} /><div><h3 id={`movement-history-${stock.id}`} className="font-black text-ink">Complete movement history</h3><p className="text-xs text-slate-500">Server-recorded actions with quantity, operator, date, time, and reference.</p></div></div>
        {genealogy.inventoryTransactions.length === 0 ? <p className="p-4 text-sm text-slate-500">No inventory movements are recorded for this batch.</p> : <div className="overflow-x-auto"><table className="production-table min-w-[1150px]"><thead><tr><th>Movement</th><th>From</th><th>To</th><th>Quantity</th><th>Operator / EPF</th><th>Date / time</th><th>Reference</th></tr></thead><tbody>{genealogy.inventoryTransactions.map((movement) => <tr key={movement.id}><td><StatusBadge status={movement.transactionType} /></td><td><p className="font-bold">{movement.sourceSection ?? '—'}</p><p className="text-xs text-slate-500">{movement.sourceRecordType ?? 'Record'} #{movement.sourceRecordId ?? '—'}</p></td><td><p className="font-bold">{movement.destinationSection ?? '—'}</p><p className="text-xs text-slate-500">{movement.destinationRecordType ?? 'Record'} #{movement.destinationRecordId ?? '—'}</p></td><td><p className="font-bold">{movement.quantity} {movement.unit}</p><p className="text-xs text-slate-500">{movement.weightKg != null ? kg(movement.weightKg) : 'Weight not recorded'}</p></td><td><p className="font-bold">{movement.actor.fullName}</p><p className="text-xs text-slate-500">EPF {movement.actor.employeeId ?? 'TBC'}</p></td><td>{formatDateTime(movement.transactionTime)}</td><td className="max-w-72 text-xs text-slate-600">{movement.reasonReference ?? '—'}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  )
}
