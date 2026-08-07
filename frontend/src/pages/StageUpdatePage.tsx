import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CirclePlay, Pause, RotateCcw, Save, TimerReset } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { api, displayError, formatDateTime, formatElapsed } from '../lib/api'
import type { Batch, Stage } from '../types'

export function StageUpdatePage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [batches, setBatches] = useState<Batch[]>([])
  const [batchId, setBatchId] = useState(searchParams.get('batch') ?? '')
  const [stages, setStages] = useState<Stage[]>([])
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [completion, setCompletion] = useState({ actualQuantity: '', temperatureCelsius: '', mixingTimeMinutes: '', speedRpm: '', notes: '' })

  const loadBatches = useCallback(async () => {
    try { setBatches(await api<Batch[]>('/api/batches')) } catch (reason) { setError(displayError(reason)) }
  }, [])
  const loadStages = useCallback(async () => {
    if (!batchId) { setStages([]); return }
    try { setStages(await api<Stage[]>(`/api/stages/batch/${batchId}`)); setError('') } catch (reason) { setError(displayError(reason)) }
  }, [batchId])

  useEffect(() => { void loadBatches() }, [loadBatches])
  useEffect(() => { void loadStages() }, [loadStages])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const timer = window.setInterval(() => void loadBatches(), 30_000)
    return () => window.clearInterval(timer)
  }, [loadBatches])

  const selectedBatch = useMemo(() => batches.find((batch) => batch.id === Number(batchId)), [batches, batchId])

  const start = async (stageNumber: number) => {
    if (!selectedBatch) return
    const preparingPlannedStageOne = stageNumber === 1 && selectedBatch.status === 'PLANNED'
    let overrideReason: string | null = null
    let managerOverride = false
    let earlyStartReason: string | null = null
    let earlyStartOverride = false
    if (stageNumber === 1 && selectedBatch.plannedStartTime && now < new Date(selectedBatch.plannedStartTime).getTime()) {
      if (!['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')) {
        setError(`This batch is scheduled to start at ${formatDateTime(selectedBatch.plannedStartTime)}.`)
        return
      }
      earlyStartReason = window.prompt(`This batch is scheduled for ${formatDateTime(selectedBatch.plannedStartTime)}. Enter the authorized early-start reason:`)
      if (!earlyStartReason?.trim()) return
      earlyStartOverride = true
    }
    if (stageNumber === 2 && !stages.some((stage) => stage.stageNumber === 1 && ['COMPLETED', 'OVERRIDDEN'].includes(stage.completionStatus))) {
      if (!['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')) {
        setError('Stage 1 must be completed before Stage 2.')
        return
      }
      overrideReason = window.prompt('Manager override reason (required):')
      if (!overrideReason) return
      managerOverride = true
    }
    const confirmation = preparingPlannedStageOne
      ? `Batch ${selectedBatch.factoryReference} is PLANNED. Confirm its materials are ready, mark it READY_FOR_STAGE_1, and record IN now?`
      : `Record IN time and start Stage ${stageNumber} for ${selectedBatch.factoryReference}?`
    if (!window.confirm(confirmation)) return
    try {
      if (preparingPlannedStageOne) {
        await api(`/api/batches/${selectedBatch.id}/transition`, {
          method: 'POST',
          body: JSON.stringify({
            status: 'READY_FOR_STAGE_1',
            reason: 'Materials confirmed ready from Stage 1 control',
          }),
        })
      }
      await api('/api/stages/start', {
        method: 'POST',
        body: JSON.stringify({
          batchId: selectedBatch.id,
          stageNumber,
          machine: selectedBatch.machine,
          managerOverride,
          overrideReason,
          earlyStartOverride,
          earlyStartReason,
        }),
      })
      await Promise.all([loadStages(), loadBatches()])
    } catch (reason) { setError(displayError(reason)) }
  }

  const pause = async (stage: Stage) => {
    const reason = window.prompt('Reason for pausing this stage:')
    if (!reason) return
    try {
      await api(`/api/stages/${stage.id}/pause`, { method: 'POST', body: JSON.stringify({ reason }) })
      await loadStages()
    } catch (value) { setError(displayError(value)) }
  }

  const resume = async (stage: Stage) => {
    try {
      await api(`/api/stages/${stage.id}/resume`, { method: 'POST' })
      await loadStages()
    } catch (value) { setError(displayError(value)) }
  }

  const complete = async (stage: Stage) => {
    if (!completion.actualQuantity) { setError('Actual quantity is required to complete the stage.'); return }
    if (!window.confirm(`Record OUT time and complete Stage ${stage.stageNumber}?`)) return
    try {
      await api(`/api/stages/${stage.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          actualQuantity: Number(completion.actualQuantity),
          temperatureCelsius: completion.temperatureCelsius ? Number(completion.temperatureCelsius) : null,
          mixingTimeSeconds: completion.mixingTimeMinutes
            ? Math.round(Number(completion.mixingTimeMinutes) * 60)
            : null,
          speedRpm: completion.speedRpm ? Number(completion.speedRpm) : null,
          notes: completion.notes,
        }),
      })
      setCompletion({ actualQuantity: '', temperatureCelsius: '', mixingTimeMinutes: '', speedRpm: '', notes: '' })
      await Promise.all([loadStages(), loadBatches()])
    } catch (value) { setError(displayError(value)) }
  }

  return (
    <div>
      <PageHeader eyebrow="Operator work centre" title="Mixing stage update" description="Large, focused controls for starting, pausing, resuming, and completing Stage 1 and Stage 2." />
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <section className="card mb-6 p-5">
        <label className="block max-w-2xl"><span className="label">Select assigned batch</span><select className="field" value={batchId} onChange={(event) => setBatchId(event.target.value)}><option value="">Choose a batch</option>{batches.filter((batch) => !['CANCELLED', 'RELEASED_TO_BLANKING'].includes(batch.status)).map((batch) => <option key={batch.id} value={batch.id}>{batch.factoryReference} · Rev {batch.revisionNumber} · {batch.status.replaceAll('_', ' ')}</option>)}</select></label>
      </section>

      {selectedBatch && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="card p-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Factory reference</p><p className="mt-2 text-lg font-black text-ink">{selectedBatch.factoryReference}</p></div>
            <div className="card p-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Recipe</p><p className="mt-2 text-lg font-black text-ink">{selectedBatch.recipeCode} · Rev {selectedBatch.revisionNumber}</p></div>
            <div className="card p-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Planned load</p><p className="mt-2 text-lg font-black text-ink">{selectedBatch.plannedQuantityKg} kg</p></div>
            <div className="card p-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Current status</p><div className="mt-2"><StatusBadge status={selectedBatch.status} /></div></div>
          </div>

          {selectedBatch.plannedStartTime && (
            <section className={`mb-6 rounded-2xl border p-5 ${selectedBatch.scheduleTimingStatus === 'OVERDUE' ? 'border-red-200 bg-red-50' : 'border-violet-200 bg-violet-50'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Assigned production window</p>
                  <p className="mt-2 font-black text-ink">{formatDateTime(selectedBatch.plannedStartTime)} → {formatDateTime(selectedBatch.targetCompletionTime)}</p>
                  <p className="mt-1 text-sm text-slate-600">Priority: {selectedBatch.productionPriority.replaceAll('_', ' ')}{selectedBatch.scheduleNotes ? ` · ${selectedBatch.scheduleNotes}` : ''}</p>
                </div>
                <StatusBadge status={selectedBatch.scheduleTimingStatus} />
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">The target is monitored by management. An overdue batch remains operable and must still be completed using the normal OUT control.</p>
            </section>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            {[1, 2].map((number) => {
              const stage = stages.find((item) => item.stageNumber === number)
              const canStartByStatus = !stage && (
                (number === 1 && ['PLANNED', 'MATERIALS_ISSUED', 'READY_FOR_STAGE_1'].includes(selectedBatch.status))
                || (number === 2 && ['STAGE_1_COMPLETED', 'READY_FOR_STAGE_2'].includes(selectedBatch.status))
                || (number === 2 && ['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? ''))
              )
              const beforePlannedStart = number === 1 && Boolean(selectedBatch.plannedStartTime)
                && now < new Date(selectedBatch.plannedStartTime!).getTime()
              const canOverrideEarlyStart = ['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
              const canStart = canStartByStatus && (!beforePlannedStart || canOverrideEarlyStart)
              return (
                <section key={number} className={`rounded-2xl border-2 bg-white p-6 shadow-sm ${stage?.completionStatus === 'IN_PROGRESS' ? 'border-process' : 'border-slate-200'}`}>
                  <div className="flex items-start justify-between">
                    <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-process">Mixing process</p><h2 className="mt-1 text-2xl font-black text-ink">Stage {number}</h2><p className="mt-2 text-sm text-slate-500">{number === 1 ? 'Raw materials into compound' : 'Sulphur and chemical additions'}</p></div>
                    <StatusBadge status={stage?.completionStatus ?? 'NOT_STARTED'} />
                  </div>

                  {!stage && (
                    <button className="btn-primary mt-8 w-full py-4 text-base" onClick={() => start(number)} disabled={!canStart}>
                      <CirclePlay size={21} /> {
                        canStart
                          ? beforePlannedStart
                            ? 'Authorize early start & record IN'
                            : number === 1 && selectedBatch.status === 'PLANNED'
                            ? 'Confirm ready & record IN'
                            : `Record IN & start Stage ${number}`
                          : beforePlannedStart
                            ? `Scheduled ${formatDateTime(selectedBatch.plannedStartTime)}`
                            : `Stage ${number} not ready`
                      }
                    </button>
                  )}

                  {stage && (
                    <div className="mt-6">
                      <dl className="mb-5 grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
                        <div><dt className="text-xs text-slate-400">IN time</dt><dd className="mt-1 font-bold">{formatDateTime(stage.startTime)}</dd></div>
                        <div><dt className="text-xs text-slate-400">OUT time</dt><dd className="mt-1 font-bold">{stage.endTime ? formatDateTime(stage.endTime) : 'Processing…'}</dd></div>
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Mixing time in minutes</dt>
                          <dd className="mt-1 font-mono text-lg font-black text-process">
                            {(Math.max(0, ((stage.endTime ? new Date(stage.endTime).getTime() : now) - new Date(stage.startTime!).getTime()) / 60_000)).toFixed(1)} min
                          </dd>
                          <dd className="mt-1 text-[11px] text-slate-400">{formatElapsed(stage.startTime, stage.endTime, now)} elapsed</dd>
                        </div>
                        <div><dt className="text-xs text-slate-400">Officer</dt><dd className="mt-1 font-bold">{stage.officer.fullName}</dd></div>
                        <div><dt className="text-xs text-slate-400">Machine</dt><dd className="mt-1 font-bold">{stage.machine}</dd></div>
                        <div><dt className="text-xs text-slate-400">Pause events</dt><dd className="mt-1 font-bold">{stage.pauseEvents.length}</dd></div>
                      </dl>

                      {stage.completionStatus === 'IN_PROGRESS' && (
                        <>
                          <div className="mb-5 grid grid-cols-2 gap-3">
                            <button className="btn-secondary" onClick={() => pause(stage)}><Pause size={17} /> Pause stage</button>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label><span className="label">Actual quantity (kg)</span><input className="field" type="number" min="0.001" step="0.001" value={completion.actualQuantity} onChange={(e) => setCompletion({ ...completion, actualQuantity: e.target.value })} /></label>
                            <label><span className="label">Temperature °C</span><input className="field" type="number" step="0.1" value={completion.temperatureCelsius} onChange={(e) => setCompletion({ ...completion, temperatureCelsius: e.target.value })} placeholder="Optional" /></label>
                            <label><span className="label">Mixing time (minutes)</span><input className="field" type="number" min="0.1" step="0.1" value={completion.mixingTimeMinutes} onChange={(e) => setCompletion({ ...completion, mixingTimeMinutes: e.target.value })} placeholder="e.g. 8.0" /></label>
                            <label><span className="label">Speed RPM</span><input className="field" type="number" step="0.1" value={completion.speedRpm} onChange={(e) => setCompletion({ ...completion, speedRpm: e.target.value })} placeholder="Optional" /></label>
                            <label className="sm:col-span-2"><span className="label">Notes</span><textarea className="field min-h-20" value={completion.notes} onChange={(e) => setCompletion({ ...completion, notes: e.target.value })} /></label>
                          </div>
                          <button className="btn-primary mt-4 w-full" onClick={() => complete(stage)}><Save size={17} /> Record OUT & complete Stage {number}</button>
                        </>
                      )}
                      {stage.completionStatus === 'PAUSED' && <button className="btn-primary w-full" onClick={() => resume(stage)}><RotateCcw size={17} /> Resume Stage {number}</button>}
                      {['COMPLETED', 'OVERRIDDEN'].includes(stage.completionStatus) && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                            <CheckCircle2 size={19} /> OUT recorded {formatDateTime(stage.endTime)} · Actual {stage.actualQuantity} kg
                          </div>
                          {number === 1 && ['READY_FOR_STAGE_2', 'STAGE_2_IN_PROGRESS', 'STAGE_2_COMPLETED'].includes(selectedBatch.status) && (
                            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                              <TimerReset size={19} /> Stage 1 issued to Stage 2 for sulphur addition
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
