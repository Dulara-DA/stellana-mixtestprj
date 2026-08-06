import { useCallback, useMemo, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime } from '../lib/api'
import type { CartReceipt, Press, ProductionShift } from '../types'

const TOPICS = ['/topic/moulding', '/topic/blanking'] as const

export function ReceivingHistoryPage() {
  const [receipts, setReceipts] = useState<CartReceipt[]>([])
  const [presses, setPresses] = useState<Press[]>([])
  const [filters, setFilters] = useState({ date: '', shift: '', pressId: '', operator: '', cart: '', batch: '' })
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const [receiptData, pressData] = await Promise.all([
        api<CartReceipt[]>('/api/moulding/receipts'),
        api<Press[]>('/api/moulding/presses'),
      ])
      setReceipts(receiptData)
      setPresses(pressData)
      setError('')
    } catch (reason) { setError(displayError(reason)) }
  }, [])
  const connected = useRealtimeRefresh(load, TOPICS)
  const visible = useMemo(() => receipts.filter((item) =>
    (!filters.date || item.productionDate === filters.date)
      && (!filters.shift || item.shift === filters.shift as ProductionShift)
      && (!filters.pressId || item.pressId === Number(filters.pressId))
      && (!filters.operator || item.receivingOperator.fullName.toLowerCase().includes(filters.operator.toLowerCase()))
      && (!filters.cart || item.cartNumber.toLowerCase().includes(filters.cart.toLowerCase()))
      && (!filters.batch || item.blankingBatchNumber.toLowerCase().includes(filters.batch.toLowerCase())),
  ), [filters, receipts])

  return (
    <div>
      <PageHeader eyebrow="Permanent transfer records" title="Receiving history" description="Server-recorded cart receipts cannot be entered twice or backdated by an operator." actions={<LiveIndicator connected={connected} />} />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <div className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <label><span className="label">Date</span><input className="field" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></label>
        <label><span className="label">Shift</span><select className="field" value={filters.shift} onChange={(e) => setFilters({ ...filters, shift: e.target.value })}><option value="">All</option><option value="SHIFT_A">Shift A</option><option value="SHIFT_B">Shift B</option><option value="SHIFT_C">Shift C</option></select></label>
        <label><span className="label">Press</span><select className="field" value={filters.pressId} onChange={(e) => setFilters({ ...filters, pressId: e.target.value })}><option value="">All</option>{presses.map((press) => <option key={press.id} value={press.id}>{press.pressNumber}</option>)}</select></label>
        <label><span className="label">Moulding operator</span><input className="field" value={filters.operator} onChange={(e) => setFilters({ ...filters, operator: e.target.value })} /></label>
        <label><span className="label">Cart</span><input className="field" value={filters.cart} onChange={(e) => setFilters({ ...filters, cart: e.target.value })} /></label>
        <label><span className="label">Blanking batch</span><input className="field" value={filters.batch} onChange={(e) => setFilters({ ...filters, batch: e.target.value })} /></label>
      </div>
      {visible.length === 0 ? <EmptyState title="No receiving records" message="Dispatched carts appear here after Moulding confirms physical receipt." /> : (
        <div className="table-shell">
          <table><thead><tr><th>Receipt / cart</th><th>Blanking batch</th><th>Quantity</th><th>Press</th><th>Sent by / time</th><th>Received by / time</th><th>Status</th></tr></thead>
            <tbody>{visible.map((item) => <tr key={item.id}>
              <td><p className="font-black">{item.receiptNumber ?? `Receipt #${item.id}`}</p><p className="text-xs text-slate-500">{item.cartNumber}</p></td>
              <td>{item.blankingBatchNumber}</td><td>{item.receivedQuantity} pieces</td><td>{item.pressNumber}<p className="text-xs">{item.productionDate} · {item.shift.replace('_', ' ')}</p></td>
              <td>{item.sendingOperator.fullName}<p className="text-xs text-slate-500">{formatDateTime(item.dispatchTime)}</p></td>
              <td>{item.receivingOperator.fullName}<p className="text-xs text-slate-500">{formatDateTime(item.receivedAt)}</p></td>
              <td><StatusBadge status={item.receiptStatus} /></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {visible.length === 0 && receipts.length > 0 && <div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><PackageCheck size={17} /> Clear filters to view other receipts.</div>}
    </div>
  )
}
