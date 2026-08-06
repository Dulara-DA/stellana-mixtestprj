import { useCallback, useMemo, useState } from 'react'
import { Boxes, CircleDot, Factory, PackageCheck, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime } from '../lib/api'
import type { BlankingCart, MaterialShortage, Press, PressStatus, ProductionShift } from '../types'

const TOPICS = ['/topic/production'] as const

function cartFactoryContext(value?: string): { productionDate: string; shift: ProductionShift | '' } {
  if (!value) return { productionDate: '', shift: '' }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  const date = `${part('year')}-${part('month')}-${part('day')}`
  const hour = Number(part('hour'))
  if (hour < 6) {
    const previous = new Date(`${date}T00:00:00Z`)
    previous.setUTCDate(previous.getUTCDate() - 1)
    return { productionDate: previous.toISOString().slice(0, 10), shift: 'SHIFT_C' }
  }
  if (hour < 14) return { productionDate: date, shift: 'SHIFT_A' }
  if (hour < 22) return { productionDate: date, shift: 'SHIFT_B' }
  return { productionDate: date, shift: 'SHIFT_C' }
}

export function MouldingDashboardPage() {
  const { user } = useAuth()
  const canReceive = ['MOULDING_OPERATOR', 'MOULDING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canOpenProduction = ['MOULDING_OPERATOR', 'MOULDING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canViewManagerReport = ['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canChangePressStatus = ['MOULDING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const [presses, setPresses] = useState<Press[]>([])
  const [carts, setCarts] = useState<BlankingCart[]>([])
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [filters, setFilters] = useState({ press: '', date: '', shift: '', batch: '', status: '', blankingOperator: '', itemCode: '', compoundCode: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const [pressData, cartData, shortageData] = await Promise.all([
        api<Press[]>('/api/moulding/presses'),
        api<BlankingCart[]>('/api/moulding/upcoming-carts'),
        api<MaterialShortage[]>('/api/shortages'),
      ])
      setPresses(pressData)
      setCarts(cartData)
      setShortages(shortageData)
      setError('')
    } catch (reason) { setError(displayError(reason)) }
  }, [])
  const connected = useRealtimeRefresh(load, TOPICS)
  const filteredCarts = useMemo(() => carts.filter((cart) => {
    const context = cartFactoryContext(cart.dispatchedAt ?? cart.createdAt)
    return (!filters.press || cart.destinationPressId === Number(filters.press))
      && (!filters.date || context.productionDate === filters.date)
      && (!filters.shift || context.shift === filters.shift)
      && (!filters.batch || cart.blankingBatchNumber.toLowerCase().includes(filters.batch.toLowerCase()))
      && (!filters.status || cart.status === filters.status)
      && (!filters.blankingOperator || cart.createdBy.fullName.toLowerCase().includes(filters.blankingOperator.toLowerCase()))
      && (!filters.itemCode || (cart.itemCode ?? '').toLowerCase().includes(filters.itemCode.toLowerCase()))
      && (!filters.compoundCode || cart.materialCode.toLowerCase().includes(filters.compoundCode.toLowerCase()))
  }), [carts, filters])

  const receive = async (cart: BlankingCart) => {
    if (!window.confirm(`Confirm receipt of ${cart.cartNumber} at ${cart.destinationPressNumber}? This can be recorded only once.`)) return
    try {
      await api(`/api/moulding/carts/${cart.id}/receive`, {
        method: 'POST',
        body: JSON.stringify({ pressId: cart.destinationPressId, supervisorOverride: false, overrideReason: null }),
      })
      setMessage(`${cart.cartNumber} received. ${cart.quantity} blanks added to ${cart.destinationPressNumber}.`)
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const changePressStatus = async (press: Press, status: PressStatus) => {
    if (status === press.status) return
    const reason = ['STOPPED', 'MAINTENANCE'].includes(status)
      ? window.prompt(`Enter the required reason for changing ${press.pressNumber} to ${status.replace('_', ' ')}:`)
      : ''
    if (['STOPPED', 'MAINTENANCE'].includes(status) && !reason?.trim()) return
    if (!window.confirm(`Change ${press.pressNumber} from ${press.status} to ${status}?`)) return
    try {
      await api(`/api/moulding/presses/${press.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      })
      setMessage(`${press.pressNumber} status changed to ${status.replaceAll('_', ' ')}.`)
      await load()
    } catch (reasonValue) { setError(displayError(reasonValue)) }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Moulding live view"
        title="Press inventory and incoming carts"
        description="Moulding receives dispatched carts exactly once. The server records receipt time, shift and operator identity."
        actions={<LiveIndicator connected={connected} />}
      />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

      <div className="mb-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {presses.map((press) => (
          <article key={press.id} className="card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-xl bg-blue-100 text-process"><Factory size={23} /></div><div><h2 className="text-xl font-black text-ink">{press.pressNumber}</h2><p className="text-sm text-slate-500">{press.pressName}</p></div></div>
              {canChangePressStatus ? (
                <select
                  className="field w-44"
                  value={press.status}
                  onChange={(event) => void changePressStatus(press, event.target.value as PressStatus)}
                  aria-label={`Change ${press.pressNumber} status`}
                >
                  {['IDLE', 'WAITING_FOR_BLANKS', 'RUNNING', 'STOPPED', 'MAINTENANCE'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
                </select>
              ) : <StatusBadge status={press.status} />}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-black">{press.availableBlankQuantity}</p><p className="text-xs text-slate-500">Blanks available</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-black">{press.cartsWaitingToBeReceived}</p><p className="text-xs text-slate-500">Carts incoming</p></div>
              <div className="rounded-xl bg-emerald-50 p-3"><p className="text-2xl font-black text-emerald-700">{press.goodTyreQuantity}</p><p className="text-xs text-emerald-700">Good tyres</p></div>
              <div className="rounded-xl bg-red-50 p-3"><p className="text-2xl font-black text-red-700">{press.rejectedTyreQuantity + press.rejectedBlankQuantity}</p><p className="text-xs text-red-700">Total rejected</p></div>
            </div>
            <div className="mt-4 grid gap-1 text-xs text-slate-500">
              <p>Shift: <span className="font-bold text-slate-700">{press.currentShift.replace('_', ' ')}</span></p>
              <p>Operator: <span className="font-bold text-slate-700">{press.currentOperator?.fullName ?? 'Not assigned'}</span></p>
              <p>Current batch: <span className="font-bold text-slate-700">{press.currentBlankingBatchNumber ?? 'None'}</span></p>
              <p>Consumed/output recorded: <span className="font-bold text-slate-700">{press.goodTyreQuantity + press.rejectedTyreQuantity + press.rejectedBlankQuantity}</span></p>
              <p>Estimated next requirement: <span className="font-bold text-slate-700">{press.estimatedNextBlankRequirement} blanks</span></p>
              <p>Open notes: <span className="font-bold text-slate-700">{shortages.filter((item) => item.pressId === press.id && !['FULFILLED', 'CANCELLED'].includes(item.status)).length}</span>{shortages.some((item) => item.pressId === press.id && item.priority === 'URGENT' && !['FULFILLED', 'CANCELLED'].includes(item.status)) && <span className="ml-2 font-black text-red-700">URGENT</span>}</p>
              <p>Last activity: <span className="font-bold text-slate-700">{formatDateTime(press.lastActivityAt)}</span></p>
            </div>
          </article>
        ))}
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div><h2 className="font-black text-ink">Upcoming carts</h2><p className="text-xs text-slate-500">Dispatched by Blanking and awaiting physical receipt</p></div>
          {canOpenProduction && <Link to="/moulding/production" className="btn-primary"><CircleDot size={17} /> Production records</Link>}
        </div>
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <label><span className="label">Press</span><select className="field" value={filters.press} onChange={(e) => setFilters({ ...filters, press: e.target.value })}><option value="">All presses</option>{presses.map((press) => <option key={press.id} value={press.id}>{press.pressNumber}</option>)}</select></label>
          <label><span className="label">Production date</span><input className="field" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></label>
          <label><span className="label">Shift</span><select className="field" value={filters.shift} onChange={(e) => setFilters({ ...filters, shift: e.target.value })}><option value="">All shifts</option><option value="SHIFT_A">Shift A</option><option value="SHIFT_B">Shift B</option><option value="SHIFT_C">Shift C</option></select></label>
          <label><span className="label">Batch number</span><input className="field" value={filters.batch} onChange={(e) => setFilters({ ...filters, batch: e.target.value })} /></label>
          <label><span className="label">Cart status</span><select className="field" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option><option value="PREPARED">Prepared</option><option value="HELD">Held</option><option value="READY_FOR_DISPATCH">Ready</option><option value="DISPATCHED">Dispatched</option></select></label>
          <label><span className="label">Blanking operator</span><input className="field" value={filters.blankingOperator} onChange={(e) => setFilters({ ...filters, blankingOperator: e.target.value })} /></label>
          <label><span className="label">Item code</span><input className="field" value={filters.itemCode} onChange={(e) => setFilters({ ...filters, itemCode: e.target.value })} /></label>
          <label><span className="label">Compound code</span><input className="field" value={filters.compoundCode} onChange={(e) => setFilters({ ...filters, compoundCode: e.target.value })} /></label>
        </div>
        {filteredCarts.length === 0 ? (
          <div className="grid min-h-56 place-items-center text-center"><div><PackageCheck className="mx-auto text-slate-300" size={34} /><p className="mt-3 font-bold">No carts waiting</p><p className="text-sm text-slate-500">All dispatched carts have been received.</p></div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="production-table">
              <thead><tr><th>Cart / item</th><th>Blanking trace</th><th>Quantity / weight</th><th>Destination</th><th>Blanking operator / time</th><th>Note / status</th><th>Receipt</th></tr></thead>
              <tbody>{filteredCarts.map((cart) => (
                <tr key={cart.id}>
                  <td className="font-black">{cart.cartNumber}<p className="text-xs font-normal text-slate-500">{cart.itemCode ?? 'Item TBC'}</p></td>
                  <td>{cart.blankingBatchNumber}<p className="text-xs text-slate-500">{cart.mixingBatchNumber} · {cart.materialCode}</p></td>
                  <td>{cart.quantity} pieces<p className="text-xs text-slate-500">{cart.materialWeightKg ?? '—'} kg</p></td>
                  <td>{cart.destinationPressNumber}</td>
                  <td>{cart.dispatchedBy?.fullName ?? cart.createdBy.fullName}<p className="text-xs text-slate-500">{formatDateTime(cart.dispatchedAt ?? cart.createdAt)}</p></td>
                  <td><p className="mb-1 max-w-xs text-xs text-slate-500">{cart.status === 'HELD' ? cart.holdReason : cart.blankingNote}</p><StatusBadge status={cart.status} /></td>
                  <td>{canReceive && cart.status === 'DISPATCHED' ? <button className="btn-primary" onClick={() => receive(cart)}><Truck size={17} /> Receive cart</button> : <span className="text-xs text-slate-400">{cart.status === 'HELD' ? 'Held in Blanking' : cart.status === 'PREPARED' || cart.status === 'READY_FOR_DISPATCH' ? 'Awaiting dispatch' : 'Read only'}</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <div className="mt-5 flex flex-wrap gap-3"><Link to="/shortages" className="btn-secondary"><Boxes size={17} /> Shortage requests</Link>{canViewManagerReport && <Link to="/production-manager" className="btn-secondary">Manager report</Link>}</div>
    </div>
  )
}
