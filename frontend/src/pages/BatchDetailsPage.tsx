import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, Clock3, ExternalLink, FlaskConical, History, PackageCheck,
  PauseCircle, QrCode, Save, UserRound, Weight,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { api, displayError, formatDateTime, formatElapsed, humanize } from '../lib/api'
import type { Batch, BatchStatus, Stage, StatusHistory } from '../types'

const transitionOptions: Partial<Record<BatchStatus, BatchStatus[]>> = {
  PLANNED: ['WAITING_FOR_MATERIALS', 'READY_FOR_STAGE_1', 'CANCELLED'],
  WAITING_FOR_MATERIALS: ['MATERIALS_REQUESTED', 'STOPPED', 'CANCELLED'],
  MATERIALS_ISSUED: ['READY_FOR_STAGE_1', 'STOPPED'],
  READY_FOR_STAGE_1: ['STAGE_1_IN_PROGRESS', 'STOPPED', 'CANCELLED'],
  STAGE_1_COMPLETED: ['READY_FOR_STAGE_2', 'STOPPED'],
  READY_FOR_STAGE_2: ['STAGE_2_IN_PROGRESS', 'STOPPED'],
  STAGE_2_COMPLETED: ['SAMPLE_SENT_TO_LAB', 'STOPPED'],
  LAB_PASSED: ['RELEASED_TO_BLANKING', 'ON_HOLD'],
  LAB_FAILED: ['REPROCESSING', 'ON_HOLD', 'RETEST_REQUIRED'],
  ON_HOLD: ['WAITING_FOR_LAB', 'RETEST_REQUIRED', 'STOPPED'],
  RETEST_REQUIRED: ['SAMPLE_SENT_TO_LAB', 'WAITING_FOR_LAB'],
}

export function BatchDetailsPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [batch, setBatch] = useState<Batch | null>(null)
  const [history, setHistory] = useState<StatusHistory[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [qrUrl, setQrUrl] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [batchData, historyData, stageData] = await Promise.all([
        api<Batch>(`/api/batches/${id}`),
        api<StatusHistory[]>(`/api/batches/${id}/history`),
        api<Stage[]>(`/api/stages/batch/${id}`),
      ])
      setBatch(batchData)
      setHistory(historyData)
      setStages(stageData)
      setError('')

      const token = localStorage.getItem('stellana_token')
      const response = await fetch(`/api/batches/${id}/qr`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (response.ok) {
        const blob = await response.blob()
        setQrUrl((current) => {
          if (current) URL.revokeObjectURL(current)
          return URL.createObjectURL(blob)
        })
      }
    } catch (reasonValue) {
      setError(displayError(reasonValue))
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => () => {
    if (qrUrl) URL.revokeObjectURL(qrUrl)
  }, [qrUrl])

  const availableTransitions = useMemo(
    () => (batch ? transitionOptions[batch.status] ?? [] : []),
    [batch],
  )

  const transition = async () => {
    if (!batch || !target) return
    if (['STOPPED', 'CANCELLED', 'ON_HOLD'].includes(target) && !reason.trim()) {
      setError('Enter a reason for a stopped, cancelled, or held batch.')
      return
    }
    if (!window.confirm(`Confirm status change to ${humanize(target)}?`)) return
    try {
      await api(`/api/batches/${batch.id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ status: target, reason }),
      })
      setTarget('')
      setReason('')
      await load()
    } catch (reasonValue) {
      setError(displayError(reasonValue))
    }
  }

  if (!batch) {
    return <div className="card p-8 text-sm text-slate-600">{error || 'Loading batch record…'}</div>
  }

  const management = ['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const traceUrl = `${window.location.origin}/trace/${batch.traceabilityCode}`

  return (
    <div>
      <PageHeader
        eyebrow="Batch traceability"
        title={batch.factoryReference}
        description={`Factory batch ${batch.batchNumber} · ${batch.compoundName} · Revision ${batch.revisionNumber}`}
        actions={
          <>
            <StatusBadge status={batch.status} />
            <Link to="/batches" className="btn-secondary"><ArrowLeft size={17} /> Back</Link>
          </>
        }
      />
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Weight, label: 'Planned quantity', value: `${batch.plannedQuantityKg} kg` },
          { icon: UserRound, label: 'Assigned officer', value: batch.assignedOfficer.fullName },
          { icon: Clock3, label: 'Created', value: formatDateTime(batch.createdAt) },
          { icon: FlaskConical, label: 'Lab / Release', value: `${humanize(batch.laboratoryStatus)} · ${humanize(batch.releaseStatus)}` },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="card flex items-center gap-4 p-5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icon size={20} /></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-1 text-sm font-black text-ink">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-lg font-black text-ink">Mixing stages</h2>
                <p className="mt-1 text-xs text-slate-500">Stage 1 and Stage 2 are recorded separately</p>
              </div>
              <Link to={`/stages?batch=${batch.id}`} className="btn-secondary">Open stage controls</Link>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
              {[1, 2].map((number) => {
                const stage = stages.find((item) => item.stageNumber === number)
                return (
                  <div key={number} className="rounded-2xl border border-slate-200 p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-black text-ink">Stage {number}</p>
                      <StatusBadge status={stage?.completionStatus ?? 'NOT_STARTED'} />
                    </div>
                    <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                      <div><dt className="text-xs text-slate-400">IN time</dt><dd className="mt-1 font-semibold">{formatDateTime(stage?.startTime)}</dd></div>
                      <div><dt className="text-xs text-slate-400">OUT time</dt><dd className="mt-1 font-semibold">{stage?.endTime ? formatDateTime(stage.endTime) : stage ? 'Processing…' : '—'}</dd></div>
                      <div><dt className="text-xs text-slate-400">Elapsed</dt><dd className="mt-1 font-mono font-semibold">{stage?.endTime ? formatElapsed(stage.startTime, stage.endTime) : stage ? 'In progress' : '—'}</dd></div>
                      <div><dt className="text-xs text-slate-400">Actual</dt><dd className="mt-1 font-semibold">{stage?.actualQuantity ? `${stage.actualQuantity} kg` : '—'}</dd></div>
                      <div><dt className="text-xs text-slate-400">Pauses</dt><dd className="mt-1 font-semibold">{stage?.pauseEvents.length ?? 0}</dd></div>
                    </dl>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
              <History className="text-process" size={20} />
              <div>
                <h2 className="text-lg font-black text-ink">Status timeline</h2>
                <p className="mt-1 text-xs text-slate-500">Backend-validated status history</p>
              </div>
            </div>
            <div className="p-6">
              {history.map((item, index) => (
                <div key={item.id} className="relative flex gap-4 pb-7 last:pb-0">
                  {index < history.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-slate-200" />}
                  <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 text-process">
                    <PackageCheck size={15} />
                  </span>
                  <div>
                    <div className="flex items-center gap-2"><StatusBadge status={item.newStatus} /></div>
                    <p className="mt-2 text-xs text-slate-500">{formatDateTime(item.changedAt)} · {item.changedBy.fullName}</p>
                    {item.reason && <p className="mt-1 text-sm text-slate-600">{item.reason}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {availableTransitions.length > 0 && (
            <section className="card p-6">
              <h2 className="text-lg font-black text-ink">Update batch status</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">Only valid next statuses are shown. The backend checks every change.</p>
              <label className="mt-5 block">
                <span className="label">Next status</span>
                <select className="field" value={target} onChange={(event) => setTarget(event.target.value)}>
                  <option value="">Select status</option>
                  {availableTransitions
                    .filter((value) => management || !['RELEASED_TO_BLANKING', 'REPROCESSING', 'CANCELLED'].includes(value))
                    .map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
                </select>
              </label>
              <label className="mt-4 block">
                <span className="label">Reason / note</span>
                <textarea className="field min-h-24" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for hold, stop, or cancellation" />
              </label>
              <button className="btn-primary mt-5 w-full" onClick={transition} disabled={!target}>
                <Save size={17} /> Confirm status update
              </button>
            </section>
          )}

          {batch.issueOrStoppageReason && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2 font-black text-amber-900"><PauseCircle size={19} /> Recorded reason</div>
              <p className="mt-2 text-sm leading-6 text-amber-800">{batch.issueOrStoppageReason}</p>
            </section>
          )}

          <section className="card p-6 text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-600"><QrCode size={24} /></div>
            <h2 className="text-lg font-black text-ink">Batch QR traceability</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Contains only a safe traceability URL—no user or authentication data.</p>
            {qrUrl && <img src={qrUrl} alt={`QR code for ${batch.batchNumber}`} className="mx-auto my-4 h-48 w-48" />}
            <a href={traceUrl} target="_blank" rel="noreferrer" className="btn-secondary w-full">
              <ExternalLink size={17} /> Open public trace page
            </a>
          </section>
        </div>
      </div>
    </div>
  )
}
