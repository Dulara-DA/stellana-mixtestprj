import { useCallback, useEffect, useState } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import {
  AlertTriangle, ArrowRight, Boxes, CalendarClock, Clock3, FlaskConical, MailWarning,
  PackageCheck, RadioTower, ShieldCheck, TimerReset,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { api, displayError, formatDateTime, humanize } from '../lib/api'
import type { DashboardSummary } from '../types'

const empty: DashboardSummary = {
  activeBatches: 0,
  waitingForMaterials: 0,
  waitingForLab: 0,
  passedBatches: 0,
  failedBatches: 0,
  stoppedOrDelayed: 0,
  unreadIssues: 0,
  scheduledBatches: 0,
  readyToStart: 0,
  dueSoon: 0,
  overdue: 0,
  activeBatchDetails: [],
  scheduleBoard: [],
  batchBoard: [],
  recentActivity: [],
}

export function DashboardPage() {
  const { user, token } = useAuth()
  const [summary, setSummary] = useState(empty)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async () => {
    try {
      const response = await api<DashboardSummary>('/api/dashboard')
      setSummary({
        ...empty,
        ...response,
        activeBatchDetails: response.activeBatchDetails ?? [],
        scheduleBoard: response.scheduleBoard ?? [],
        batchBoard: response.batchBoard ?? response.activeBatchDetails ?? [],
        recentActivity: response.recentActivity ?? [],
      })
      setError('')
    } catch (reason) {
      setError(displayError(reason))
    }
  }, [])

  useEffect(() => {
    void load()
    const ticker = window.setInterval(() => {
      setNow(Date.now())
      void load()
    }, 30_000)
    if (!token) return () => window.clearInterval(ticker)

    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      onConnect: () => {
        setConnected(true)
        client.subscribe('/topic/dashboard', () => void load())
        client.subscribe('/topic/issues', () => void load())
      },
      onWebSocketClose: () => setConnected(false),
    })
    client.activate()
    return () => {
      window.clearInterval(ticker)
      void client.deactivate()
    }
  }, [load, token])

  const elapsed = (start?: string) => {
    if (!start) return '—'
    const minutes = Math.max(0, Math.floor((now - new Date(start).getTime()) / 60_000))
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  }

  const kpis = [
    { label: 'Active mixing', value: summary.activeBatches, icon: RadioTower, tone: 'blue' },
    { label: 'Waiting materials', value: summary.waitingForMaterials, icon: TimerReset, tone: 'amber' },
    { label: 'Waiting laboratory', value: summary.waitingForLab, icon: FlaskConical, tone: 'amber' },
    { label: 'Passed / released', value: summary.passedBatches, icon: PackageCheck, tone: 'green' },
    { label: 'Failed / reprocess', value: summary.failedBatches, icon: AlertTriangle, tone: 'red' },
    { label: 'Unread issues', value: summary.unreadIssues, icon: MailWarning, tone: 'red' },
  ]
  const iconTones: Record<string, string> = {
    blue: 'bg-blue-100 text-process',
    amber: 'bg-amber-100 text-amber-700',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
  }
  const scheduleMetrics = [
    { label: 'Upcoming', value: summary.scheduledBatches, status: 'SCHEDULED' },
    { label: 'Ready to start', value: summary.readyToStart, status: 'READY_TO_START' },
    { label: 'Due soon', value: summary.dueSoon, status: 'DUE_SOON' },
    { label: 'Overdue', value: summary.overdue, status: 'OVERDUE' },
  ]

  return (
    <div>
      <PageHeader
        eyebrow={user?.role === 'MIXING_OFFICER' ? 'Officer work centre' : 'Manager command centre'}
        title={user?.role === 'MIXING_OFFICER' ? 'My mixing activity' : 'Live production overview'}
        description={
          user?.role === 'MIXING_OFFICER'
            ? 'Assigned batches and the operational updates needed for your shift.'
            : 'Current Mixing Unit conditions, exceptions, and recent production activity.'
        }
        actions={
          <div className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {connected ? 'Live updates connected' : 'Reconnecting…'}
          </div>
        }
      />

      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="card p-4">
            <div className={`mb-4 grid h-10 w-10 place-items-center rounded-xl ${iconTones[tone]}`}>
              <Icon size={20} />
            </div>
            <p className="text-3xl font-black tracking-tight text-ink">{value}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <section className="card mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700"><CalendarClock size={20} /></div>
            <div><h2 className="text-lg font-black text-ink">Mixing production schedule</h2><p className="mt-1 text-xs text-slate-500">Live planned windows, assigned officers, and deadline warnings</p></div>
          </div>
          {['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
            ? <Link to="/batches/new" className="btn-secondary">Plan a batch</Link>
            : <Link to="/stages" className="btn-secondary">Open stage controls</Link>}
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-4">
          {scheduleMetrics.map((metric) => <div key={metric.label} className="flex items-center justify-between bg-white px-5 py-4"><div><p className="text-2xl font-black text-ink">{metric.value}</p><p className="text-xs font-semibold text-slate-500">{metric.label}</p></div><StatusBadge status={metric.status} /></div>)}
        </div>
        {summary.scheduleBoard.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-500">No active time-window schedules. Managers and administrators can plan one when creating or opening a batch.</p>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>Batch</th><th>Planned start</th><th>Target completion</th><th>Officer / Mixer</th><th>Priority</th><th>Timing</th><th aria-label="Open" /></tr></thead>
              <tbody>{summary.scheduleBoard.map((batch) => <tr key={batch.id}>
                <td><p className="font-black text-ink">{batch.factoryReference}</p><p className="mt-1 text-xs text-slate-500">{batch.plannedQuantityKg} kg · {batch.compoundName}</p></td>
                <td className="whitespace-nowrap font-semibold">{formatDateTime(batch.plannedStartTime)}</td>
                <td className="whitespace-nowrap font-semibold">{formatDateTime(batch.targetCompletionTime)}</td>
                <td>{batch.assignedOfficer.fullName}<p className="mt-1 text-xs text-slate-500">{batch.machine}</p></td>
                <td><StatusBadge status={batch.productionPriority} /></td>
                <td><StatusBadge status={batch.scheduleTimingStatus} /></td>
                <td><Link to={`/stages?batch=${batch.id}`} className="grid h-10 w-10 place-items-center rounded-xl text-process hover:bg-blue-50" aria-label={`Open stage controls for ${batch.batchNumber}`}><ArrowRight size={18} /></Link></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card mb-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-black text-ink">Live batch board</h2>
            <p className="mt-1 text-xs text-slate-500">Categorized by physical batch number with stage IN and OUT times</p>
          </div>
          <Link to="/batches" className="flex items-center gap-2 text-sm font-bold text-process">
            All batches <ArrowRight size={16} />
          </Link>
        </div>

        {summary.batchBoard.length === 0 ? (
          <div className="grid min-h-64 place-items-center px-8 text-center">
            <div>
              <Boxes className="mx-auto mb-3 text-slate-300" size={38} />
              <p className="font-bold text-slate-700">No batches have been added</p>
              <p className="mt-1 text-sm text-slate-500">Create a batch using its physical factory tag number.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="border-b border-slate-200 px-5 py-3">Compound Type</th>
                  <th className="border-b border-slate-200 px-5 py-3">Batch No.</th>
                  <th className="border-b border-slate-200 px-5 py-3">Current stage</th>
                  <th className="border-b border-slate-200 px-5 py-3">IN time</th>
                  <th className="border-b border-slate-200 px-5 py-3">OUT time</th>
                  <th className="border-b border-slate-200 px-5 py-3">Officer / Mixer</th>
                  <th className="border-b border-slate-200 px-5 py-3">Status</th>
                  <th className="border-b border-slate-200 px-5 py-3" aria-label="Open batch" />
                </tr>
              </thead>
              <tbody>
                {summary.batchBoard.map((batch) => {
                  const stageNumber = batch.currentStage === 2 || batch.stage2StartedAt
                    ? 2
                    : batch.stage1StartedAt ? 1 : 0
                  const inTime = stageNumber === 2 ? batch.stage2StartedAt : batch.stage1StartedAt
                  const outTime = stageNumber === 2 ? batch.stage2CompletedAt : batch.stage1CompletedAt
                  const processing = Boolean(inTime && !outTime)

                  return (
                    <tr key={batch.id} className={processing ? 'bg-blue-50/60' : 'hover:bg-slate-50'}>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <p className="font-bold text-slate-700">{batch.compoundName}</p>
                        <p className="mt-1 text-xs text-slate-500">Rev {batch.revisionNumber} · {batch.plannedQuantityKg} kg</p>
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <p className="text-lg font-black text-ink">{batch.batchNumber}</p>
                        <p className="mt-1 text-xs font-semibold text-process">{batch.factoryReference}</p>
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <p className="font-bold text-slate-700">{stageNumber ? `Stage ${stageNumber}` : 'Not started'}</p>
                        {processing && (
                          <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-process">
                            <Clock3 size={13} /> {elapsed(inTime)}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-700">
                        {formatDateTime(inTime)}
                      </td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-700">
                        {processing ? <span className="text-process">Processing…</span> : formatDateTime(outTime)}
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <p className="text-sm font-semibold text-slate-700">{batch.assignedOfficer.fullName}</p>
                        <p className="mt-1 text-xs text-slate-500">{batch.machine}</p>
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4"><StatusBadge status={batch.status} /></td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <Link
                          to={`/batches/${batch.id}`}
                          className="grid h-10 w-10 place-items-center rounded-xl text-process hover:bg-blue-100"
                          aria-label={`Open batch ${batch.batchNumber}`}
                        >
                          <ArrowRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-lg font-black text-ink">Recent activity</h2>
          <p className="mt-1 text-xs text-slate-500">Latest audited production events</p>
        </div>
        <div className="grid divide-x divide-y divide-slate-100 md:grid-cols-2 xl:grid-cols-3">
          {summary.recentActivity.map((item) => (
            <div key={item.id} className="flex gap-3 px-5 py-4">
              <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                <ShieldCheck size={15} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-700">{humanize(item.action)}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{item.newValue ?? item.entityType}</p>
                <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(item.actionTime)} · {item.actor?.fullName ?? 'System'}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
