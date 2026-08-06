import { useCallback, useState } from 'react'
import { Boxes, FlaskConical, Scale } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime } from '../lib/api'
import type { ApprovedMaterialBatch } from '../types'

const TOPICS = ['/topic/blanking', '/topic/production'] as const

export function CompoundStockPage() {
  const { user } = useAuth()
  const canControl = ['BLANKING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const [stock, setStock] = useState<ApprovedMaterialBatch[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setStock(await api<ApprovedMaterialBatch[]>('/api/blanking/compound-stock'))
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

  return (
    <div>
      <PageHeader
        eyebrow="Lab-approved compound"
        title="Compound stock"
        description="Only laboratory-PASS Mixing batches appear here. Quantities are stored and displayed in kilograms."
        actions={<LiveIndicator connected={connected} />}
      />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, Icon, tone }) => (
          <div key={label} className="card p-4">
            <div className={`mb-3 grid h-10 w-10 place-items-center rounded-xl ${tone}`}><Icon size={19} /></div>
            <p className="text-2xl font-black">{value.toFixed(3)} <span className="text-sm text-slate-500">kg</span></p>
            <p className="text-xs font-bold text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      {stock.length === 0 ? <EmptyState title="No approved compound stock" message="A Mixing batch appears after a laboratory PASS and release to Blanking." /> : (
        <div className="table-shell">
          <table>
            <thead><tr><th>Compound / Mixing batch</th><th>Lab approval</th><th>Required / received</th><th>Available / reserved</th><th>Consumed / returned</th><th>Received by / time</th><th>Status</th>{canControl && <th>Controlled status</th>}</tr></thead>
            <tbody>{stock.map((item) => (
              <tr key={item.id}>
                <td><p className="font-black">{item.materialCode}</p><p className="text-xs text-slate-500">{item.mixingBatchNumber} · {item.compoundName}</p></td>
                <td><StatusBadge status={item.labStatus} /><p className="mt-1 text-xs text-slate-500">Ref #{item.labApprovalId ?? 'TBC'}</p></td>
                <td>{item.plannedQuantityKg} kg<p className="text-xs text-slate-500">{item.receivedQuantityKg} kg received</p></td>
                <td><span className="font-black text-emerald-700">{item.availableQuantityKg} kg</span><p className="text-xs text-amber-700">{item.reservedQuantityKg} kg reserved</p></td>
                <td>{item.consumedQuantityKg} kg<p className="text-xs text-slate-500">{item.returnedQuantityKg} kg returned</p></td>
                <td>{item.receivingOperator?.fullName ?? 'System release'}<p className="text-xs text-slate-500">{formatDateTime(item.receivedAt)}</p></td>
                <td><StatusBadge status={item.stockStatus} /></td>
                {canControl && <td><select className="field min-w-36" value={item.stockStatus === 'PARTIALLY_USED' ? 'AVAILABLE' : item.stockStatus} onChange={(event) => void changeStatus(item, event.target.value as 'AVAILABLE' | 'ON_HOLD' | 'REJECTED')}><option value="AVAILABLE">Available</option><option value="ON_HOLD">On hold</option><option value="REJECTED">Rejected</option>{item.stockStatus === 'DEPLETED' && <option value="DEPLETED" disabled>Depleted</option>}{item.stockStatus === 'AWAITING_RECEIPT' && <option value="AWAITING_RECEIPT" disabled>Awaiting receipt</option>}</select></td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
