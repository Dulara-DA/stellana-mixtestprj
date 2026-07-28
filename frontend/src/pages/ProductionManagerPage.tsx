import { useCallback, useState, type FormEvent } from 'react'
import { AlertTriangle, Boxes, Download, Factory, LoaderCircle, Scale, ShieldCheck, Truck } from 'lucide-react'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, downloadFile, formatDateTime, humanize } from '../lib/api'
import type { ProductionManagerSummary } from '../types'

const TOPICS = ['/topic/production'] as const
const today = () => new Date().toISOString().slice(0, 10)
const reportParams = (values: Record<string, string>) => {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value) })
  return params
}
const emptySummary: ProductionManagerSummary = {
  fromDate: today(), toDate: today(), blankingBatchesProduced: 0, blanksProduced: 0, blanksDispatched: 0,
  blanksAvailableAtBlanking: 0, blanksAvailableAtPresses: 0, goodTyres: 0, rejectedTyres: 0,
  rejectedTyreWeightGrams: 0, rejectedBlanks: 0, rejectionPercentage: 0, openShortageRequests: 0,
  delayedCartTransfers: 0, pressesWaitingForBlanks: 0, presses: [], cartTransfers: [],
  operatorProductivity: [], recentRecords: [],
}

export function ProductionManagerPage() {
  const [summary, setSummary] = useState<ProductionManagerSummary>(emptySummary)
  const [filters, setFilters] = useState({ fromDate: today(), toDate: today(), shift: '', pressId: '', operatorId: '', blankingBatch: '', mixingBatch: '', cart: '', material: '' })
  const [applied, setApplied] = useState(filters)
  const [error, setError] = useState('')
  const [downloadMessage, setDownloadMessage] = useState('')
  const [downloading, setDownloading] = useState(false)

  const load = useCallback(async () => {
    try {
      const params = reportParams(applied)
      setSummary(await api<ProductionManagerSummary>(`/api/production-manager/summary?${params}`))
      setError('')
    } catch (reason) { setError(displayError(reason)) }
  }, [applied])
  const connected = useRealtimeRefresh(load, TOPICS)
  const applyFilters = (event: FormEvent) => { event.preventDefault(); setApplied(filters) }
  const downloadPdf = async () => {
    setDownloading(true)
    setDownloadMessage('')
    try {
      const params = reportParams(applied)
      const filename = await downloadFile(
        `/api/production-manager/report.pdf?${params}`,
        `stellana-combined-production-report-${applied.fromDate}-to-${applied.toDate}.pdf`,
      )
      setDownloadMessage(`${filename} downloaded successfully.`)
      setError('')
    } catch (reason) {
      setError(displayError(reason))
    } finally {
      setDownloading(false)
    }
  }

  const kpis = [
    ['Blanking batches', summary.blankingBatchesProduced, Factory, 'bg-blue-100 text-process'],
    ['Blanks produced', summary.blanksProduced, Boxes, 'bg-blue-100 text-process'],
    ['Blanks dispatched', summary.blanksDispatched, Truck, 'bg-amber-100 text-amber-700'],
    ['Good tyres', summary.goodTyres, ShieldCheck, 'bg-emerald-100 text-emerald-700'],
    ['Rejected items', summary.rejectedTyres + summary.rejectedBlanks, AlertTriangle, 'bg-red-100 text-red-700'],
    ['Rejected tyre weight', `${summary.rejectedTyreWeightGrams} g`, Scale, 'bg-red-100 text-red-700'],
  ] as const

  return (
    <div>
      <PageHeader
        eyebrow="Cross-section management"
        title="Mixing, Blanking and Moulding report"
        description="Operational metrics and a combined PDF generated from persisted production records. No production limits or targets are invented."
        actions={<div className="flex flex-wrap items-center gap-3"><LiveIndicator connected={connected} /><button type="button" className="btn-primary" disabled={downloading} onClick={() => void downloadPdf()}>{downloading ? <LoaderCircle className="animate-spin" size={17} /> : <Download size={17} />}{downloading ? 'Generating PDF...' : 'Download combined PDF'}</button></div>}
      />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {downloadMessage && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{downloadMessage}</div>}

      <form onSubmit={applyFilters} className="card mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-10">
        <label><span className="label">From</span><input className="field" type="date" value={filters.fromDate} onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })} /></label>
        <label><span className="label">To</span><input className="field" type="date" value={filters.toDate} onChange={(e) => setFilters({ ...filters, toDate: e.target.value })} /></label>
        <label><span className="label">Shift</span><select className="field" value={filters.shift} onChange={(e) => setFilters({ ...filters, shift: e.target.value })}><option value="">All shifts</option><option value="SHIFT_A">Shift A</option><option value="SHIFT_B">Shift B</option><option value="SHIFT_C">Shift C</option></select></label>
        <label><span className="label">Press ID</span><input className="field" min="1" type="number" value={filters.pressId} onChange={(e) => setFilters({ ...filters, pressId: e.target.value })} placeholder="All" /></label>
        <label><span className="label">Operator ID</span><input className="field" min="1" type="number" value={filters.operatorId} onChange={(e) => setFilters({ ...filters, operatorId: e.target.value })} placeholder="All" /></label>
        <label><span className="label">Blanking batch</span><input className="field" value={filters.blankingBatch} onChange={(e) => setFilters({ ...filters, blankingBatch: e.target.value })} /></label>
        <label><span className="label">Mixing batch</span><input className="field" value={filters.mixingBatch} onChange={(e) => setFilters({ ...filters, mixingBatch: e.target.value })} /></label>
        <label><span className="label">Cart</span><input className="field" value={filters.cart} onChange={(e) => setFilters({ ...filters, cart: e.target.value })} /></label>
        <label><span className="label">Material</span><input className="field" value={filters.material} onChange={(e) => setFilters({ ...filters, material: e.target.value })} /></label>
        <button className="btn-primary self-end">Apply filters</button>
      </form>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map(([label, value, Icon, tone]) => <div key={label} className="card p-4"><div className={`mb-3 grid h-10 w-10 place-items-center rounded-xl ${tone}`}><Icon size={19} /></div><p className="text-2xl font-black">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{label}</p></div>)}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-4"><p className="text-xs font-bold uppercase text-slate-500">At Blanking</p><p className="mt-2 text-2xl font-black">{summary.blanksAvailableAtBlanking}</p></div>
        <div className="card p-4"><p className="text-xs font-bold uppercase text-slate-500">At presses</p><p className="mt-2 text-2xl font-black">{summary.blanksAvailableAtPresses}</p></div>
        <div className="card p-4"><p className="text-xs font-bold uppercase text-slate-500">Rejection %</p><p className="mt-2 text-2xl font-black">{summary.rejectionPercentage}%</p></div>
        <div className="card p-4"><p className="text-xs font-bold uppercase text-slate-500">Open shortages</p><p className="mt-2 text-2xl font-black text-red-700">{summary.openShortageRequests}</p></div>
        <div className="card p-4"><p className="text-xs font-bold uppercase text-slate-500">Delayed transfers</p><p className="mt-2 text-2xl font-black text-amber-700">{summary.delayedCartTransfers}</p><p className="text-[11px] text-slate-400">Delay threshold configurable / TBC</p></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="card overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-black">Live presses</h2><p className="text-xs text-slate-500">{summary.pressesWaitingForBlanks} waiting for blanks</p></div>
          <div className="divide-y divide-slate-100">{summary.presses.map((press) => <div key={press.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-black">{press.pressNumber} · {press.pressName}</p><p className="text-xs text-slate-500">{press.availableBlankQuantity} blanks · {press.goodTyreQuantity} good tyres</p></div><StatusBadge status={press.status} /></div>)}</div>
        </section>
        <section className="table-shell">
          <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-black">Recent production</h2><p className="text-xs text-slate-500">{summary.fromDate} to {summary.toDate}{summary.shift ? ` · ${humanize(summary.shift)}` : ''}</p></div>
          <table>
            <thead><tr><th>Press / cart</th><th>Operator</th><th>Output</th><th>Rejections</th><th>Time</th></tr></thead>
            <tbody>{summary.recentRecords.map((record) => <tr key={record.id}><td><p className="font-black">{record.pressNumber}</p><p className="text-xs">{record.cartNumber} · {record.blankingBatchNumber}</p></td><td>{record.operator.fullName}<p className="text-xs">{record.operatorEmployeeId}</p></td><td>{record.goodTyreQuantity} good<p className="text-xs">{record.remainingBlankQuantity} remaining</p></td><td>{record.rejectedTyreQuantity} tyres / {record.rejectedBlankQuantity} blanks<p className="text-xs">{record.totalRejectedTyreWeightGrams} g</p></td><td>{formatDateTime(record.startTime)}<p className="text-xs">{formatDateTime(record.endTime)}</p></td></tr>)}</tbody>
          </table>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="table-shell">
          <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-black">Cart transfer status</h2><p className="text-xs text-slate-500">Latest filtered transfers from Blanking to Moulding</p></div>
          <table>
            <thead><tr><th>Cart</th><th>Source</th><th>Destination</th><th>Quantity</th><th>Status</th></tr></thead>
            <tbody>{summary.cartTransfers.map((cart) => <tr key={cart.id}><td className="font-black">{cart.cartNumber}</td><td>{cart.blankingBatchNumber}<p className="text-xs">{cart.mixingBatchNumber}</p></td><td>{cart.destinationPressNumber}</td><td>{cart.quantity}<p className="text-xs">{cart.remainingQuantity} remaining</p></td><td><StatusBadge status={cart.status} /></td></tr>)}</tbody>
          </table>
        </section>
        <section className="table-shell">
          <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-black">Operator productivity</h2><p className="text-xs text-slate-500">Persisted completed output for the selected report filters</p></div>
          <table>
            <thead><tr><th>Operator</th><th>Runs</th><th>Good tyres</th><th>Rejected</th><th>Downtime</th></tr></thead>
            <tbody>{summary.operatorProductivity.map((item) => <tr key={item.operator.id}><td><p className="font-black">{item.operator.fullName}</p><p className="text-xs">{item.employeeId}</p></td><td>{item.completedRuns}</td><td className="font-bold text-emerald-700">{item.goodTyres}</td><td className="font-bold text-red-700">{item.rejectedTyres + item.rejectedBlanks}</td><td>{item.downtimeMinutes} min</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
