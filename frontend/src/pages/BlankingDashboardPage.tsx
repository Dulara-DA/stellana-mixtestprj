import { useCallback, useState } from 'react'
import { AlertTriangle, Boxes, CircleCheckBig, Factory, PackageCheck, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime } from '../lib/api'
import type { ApprovedMaterialBatch, BlankingBatch, BlankingCart, MaterialShortage, Press } from '../types'

const TOPICS = ['/topic/production', '/topic/shortages'] as const

export function BlankingDashboardPage() {
  const [materials, setMaterials] = useState<ApprovedMaterialBatch[]>([])
  const [batches, setBatches] = useState<BlankingBatch[]>([])
  const [carts, setCarts] = useState<BlankingCart[]>([])
  const [presses, setPresses] = useState<Press[]>([])
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [materialData, batchData, cartData, pressData, shortageData] = await Promise.all([
        api<ApprovedMaterialBatch[]>('/api/blanking/approved-materials'),
        api<BlankingBatch[]>('/api/blanking/batches'),
        api<BlankingCart[]>('/api/blanking/carts'),
        api<Press[]>('/api/moulding/presses'),
        api<MaterialShortage[]>('/api/shortages'),
      ])
      setMaterials(materialData)
      setBatches(batchData)
      setCarts(cartData)
      setPresses(pressData)
      setShortages(shortageData)
      setError('')
    } catch (reason) {
      setError(displayError(reason))
    }
  }, [])
  const connected = useRealtimeRefresh(load, TOPICS)

  const kpis = [
    {
      label: 'Approved material',
      value: materials.reduce((sum, item) => sum + Number(item.availableQuantityKg), 0).toFixed(1),
      suffix: 'kg',
      icon: PackageCheck,
      tone: 'bg-emerald-100 text-emerald-700',
    },
    {
      label: 'Blanking in progress',
      value: batches.filter((item) => item.status === 'IN_PROGRESS').length,
      icon: Factory,
      tone: 'bg-blue-100 text-process',
    },
    {
      label: 'Available good blanks',
      value: batches.reduce((sum, item) => sum + item.availableGoodBlankQuantity, 0),
      icon: CircleCheckBig,
      tone: 'bg-emerald-100 text-emerald-700',
    },
    {
      label: 'Carts awaiting dispatch',
      value: carts.filter((item) => item.status === 'PREPARED').length,
      icon: Truck,
      tone: 'bg-amber-100 text-amber-700',
    },
    {
      label: 'Presses waiting',
      value: presses.filter((item) => item.status === 'WAITING_FOR_BLANKS').length,
      icon: Boxes,
      tone: 'bg-amber-100 text-amber-700',
    },
    {
      label: 'Open shortages',
      value: shortages.filter((item) => !['FULFILLED', 'CANCELLED'].includes(item.status)).length,
      icon: AlertTriangle,
      tone: 'bg-red-100 text-red-700',
    },
  ]

  return (
    <div>
      <PageHeader
        eyebrow="Blanking control"
        title="Blanking production dashboard"
        description="Approved compound, blank output, cart preparation and Moulding press demand in one live view."
        actions={<LiveIndicator connected={connected} />}
      />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map(({ label, value, suffix, icon: Icon, tone }) => (
          <div key={label} className="card p-4">
            <div className={`mb-4 grid h-11 w-11 place-items-center rounded-xl ${tone}`}><Icon size={21} /></div>
            <p className="text-3xl font-black text-ink">{value} {suffix && <span className="text-sm text-slate-500">{suffix}</span>}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div><h2 className="font-black text-ink">Current blanking batches</h2><p className="mt-1 text-xs text-slate-500">Official server shift and IN/OUT timestamps</p></div>
            <Link to="/blanking/batches" className="btn-primary">Production records</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="production-table">
              <thead><tr><th>Batch</th><th>Material source</th><th>Output</th><th>IN / OUT</th><th>Status</th></tr></thead>
              <tbody>
                {batches.slice(0, 8).map((batch) => (
                  <tr key={batch.id}>
                    <td><p className="font-black text-ink">{batch.batchNumber}</p><p className="text-xs text-slate-500">{batch.operatorEmployeeId}</p></td>
                    <td><p className="font-semibold">{batch.mixingBatchNumber}</p><p className="text-xs text-slate-500">{batch.materialCode} · {batch.materialConsumedKg} kg</p></td>
                    <td>{batch.productionQuantity ?? '—'} / {batch.plannedProductionQuantity}<p className="text-xs text-slate-500">{batch.availableGoodBlankQuantity} available</p></td>
                    <td><p>{formatDateTime(batch.startTime)}</p><p className="mt-1 text-xs text-slate-500">{formatDateTime(batch.endTime)}</p></td>
                    <td><StatusBadge status={batch.status} /></td>
                  </tr>
                ))}
                {batches.length === 0 && <tr><td colSpan={5} className="py-12 text-center text-slate-500">No blanking batches yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-black text-ink">Press demand</h2>
            <p className="mt-1 text-xs text-slate-500">Live inventory from Moulding</p>
          </div>
          <div className="divide-y divide-slate-100">
            {presses.map((press) => (
              <div key={press.id} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-black text-ink">{press.pressNumber} · {press.pressName}</p>
                  <p className="mt-1 text-xs text-slate-500">{press.availableBlankQuantity} blanks · {press.cartsWaitingToBeReceived} carts inbound</p>
                </div>
                <StatusBadge status={press.status} />
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 p-4">
            <Link to="/shortages" className="btn-secondary w-full">Open shortage mailbox</Link>
          </div>
        </section>
      </div>
    </div>
  )
}
