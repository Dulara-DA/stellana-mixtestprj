import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { FlaskConical, Plus, Send, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { api, displayError, formatDateTime } from '../lib/api'
import type { Batch, LabSample } from '../types'

interface Specification {
  id: number
  recipeCode?: string
  testName: string
  minimumValue?: number
  maximumValue?: number
  unit?: string
  notes?: string
}

export function LabPage() {
  const { user } = useAuth()
  const [samples, setSamples] = useState<LabSample[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [specs, setSpecs] = useState<Specification[]>([])
  const [selected, setSelected] = useState<LabSample | null>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    hardness: '', resilience: '', curingTimeMinutes: '', decision: 'PASS',
    comments: '', reprocessingDecision: false, additionalName: '', additionalValue: '', additionalUnit: '',
  })

  const load = useCallback(async () => {
    try {
      const [sampleData, batchData, specData] = await Promise.all([
        api<LabSample[]>('/api/lab/samples'),
        api<Batch[]>('/api/batches'),
        api<Specification[]>('/api/lab/specifications'),
      ])
      setSamples(sampleData)
      setBatches(batchData)
      setSpecs(specData)
      setError('')
    } catch (reason) { setError(displayError(reason)) }
  }, [])

  useEffect(() => { void load() }, [load])

  const sendSample = async (batch: Batch) => {
    if (!window.confirm(`Mark a sample from ${batch.batchNumber} as sent to the laboratory?`)) return
    try {
      await api(`/api/lab/batches/${batch.id}/send-sample`, { method: 'POST' })
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const submitResult = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    try {
      await api(`/api/lab/samples/${selected.id}/results`, {
        method: 'POST',
        body: JSON.stringify({
          hardness: form.hardness ? Number(form.hardness) : null,
          resilience: form.resilience ? Number(form.resilience) : null,
          curingTimeMinutes: form.curingTimeMinutes ? Number(form.curingTimeMinutes) : null,
          decision: form.decision,
          comments: form.comments,
          reprocessingDecision: form.reprocessingDecision,
          additionalResults: form.additionalName && form.additionalValue
            ? [{ testName: form.additionalName, resultValue: form.additionalValue, unit: form.additionalUnit }]
            : [],
        }),
      })
      setSelected(null)
      setForm({ hardness: '', resilience: '', curingTimeMinutes: '', decision: 'PASS', comments: '', reprocessingDecision: false, additionalName: '', additionalValue: '', additionalUnit: '' })
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const eligible = batches.filter((batch) => ['STAGE_2_COMPLETED', 'RETEST_REQUIRED'].includes(batch.status))
  const canRecord = ['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')

  return (
    <div>
      <PageHeader
        eyebrow="Quality decision"
        title="Laboratory samples and results"
        description="Manual prototype entry with configurable specifications. No unconfirmed pass/fail limits are applied automatically."
      />
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {eligible.length > 0 && (
        <section className="card mb-6 p-6">
          <h2 className="text-lg font-black text-ink">Samples ready to send</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {eligible.map((batch) => (
              <div key={batch.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
                <div><p className="font-black text-ink">{batch.batchNumber}</p><p className="mt-1 text-xs text-slate-500">{batch.recipeCode} · Rev {batch.revisionNumber}</p></div>
                <button className="btn-primary" onClick={() => sendSample(batch)}><Send size={16} /> Send</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <section>
          {samples.length === 0 ? (
            <EmptyState title="No laboratory samples" message="Complete Stage 2 and send a sample to create the first lab record." />
          ) : (
            <div className="space-y-4">
              {samples.map((sample) => (
                <div key={sample.id} className="card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-4">
                      <div className="grid h-11 w-11 place-items-center rounded-xl bg-violet-100 text-violet-700"><FlaskConical size={21} /></div>
                      <div><div className="flex items-center gap-3"><p className="font-black text-ink">{sample.sampleId}</p><StatusBadge status={sample.decision} /></div><p className="mt-1 text-sm text-slate-500">{sample.batchNumber} · {sample.recipeCode} rev {sample.revisionNumber}</p><p className="mt-2 text-xs text-slate-400">Sent {formatDateTime(sample.sentToLabAt)} · Tested {formatDateTime(sample.testDateTime)}</p></div>
                    </div>
                    {canRecord && sample.decision === 'PENDING' && <button className="btn-primary" onClick={() => setSelected(sample)}><Plus size={17} /> Record result</button>}
                  </div>
                  {sample.decision !== 'PENDING' && (
                    <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-4">
                      <div><p className="text-xs text-slate-400">Hardness</p><p className="mt-1 font-black">{sample.hardness ?? '—'}</p></div>
                      <div><p className="text-xs text-slate-400">Resilience</p><p className="mt-1 font-black">{sample.resilience ?? '—'}</p></div>
                      <div><p className="text-xs text-slate-400">Curing time</p><p className="mt-1 font-black">{sample.curingTimeMinutes ? `${sample.curingTimeMinutes} min` : '—'}</p></div>
                      <div><p className="text-xs text-slate-400">Tested by</p><p className="mt-1 font-black">{sample.testedBy?.fullName ?? '—'}</p></div>
                      {sample.comments && <p className="col-span-2 border-t border-slate-200 pt-3 text-slate-600 sm:col-span-4">{sample.comments}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="card self-start overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-black text-ink">Test specifications</h2><p className="mt-1 text-xs text-slate-500">Configurable placeholders</p></div>
          <div className="divide-y divide-slate-100">
            {specs.map((spec) => (
              <div key={spec.id} className="p-5">
                <div className="flex items-center justify-between"><p className="font-bold text-ink">{spec.testName}</p><span className="text-xs text-slate-400">{spec.recipeCode ?? 'Global'}</span></div>
                <p className="mt-2 text-sm text-slate-600">{spec.minimumValue ?? 'TBC'} – {spec.maximumValue ?? 'TBC'} {spec.unit}</p>
                {spec.notes && <p className="mt-2 text-xs leading-5 text-amber-700">{spec.notes}</p>}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-8 backdrop-blur-sm">
          <form onSubmit={submitResult} className="w-full max-w-3xl rounded-2xl bg-white p-7 shadow-2xl">
            <div className="mb-6 flex items-start justify-between">
              <div><h2 className="text-xl font-black text-ink">Record laboratory result</h2><p className="mt-1 text-sm text-slate-500">{selected.sampleId} · {selected.batchNumber}</p></div>
              <button type="button" onClick={() => setSelected(null)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100" aria-label="Close"><X size={19} /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label><span className="label">Hardness</span><input className="field" type="number" step="0.001" value={form.hardness} onChange={(e) => setForm({ ...form, hardness: e.target.value })} /></label>
              <label><span className="label">Resilience</span><input className="field" type="number" step="0.001" value={form.resilience} onChange={(e) => setForm({ ...form, resilience: e.target.value })} /></label>
              <label><span className="label">Curing time (minutes)</span><input className="field" type="number" step="0.001" value={form.curingTimeMinutes} onChange={(e) => setForm({ ...form, curingTimeMinutes: e.target.value })} /></label>
              <label><span className="label">Additional test name</span><input className="field" value={form.additionalName} onChange={(e) => setForm({ ...form, additionalName: e.target.value })} /></label>
              <label><span className="label">Additional result</span><input className="field" value={form.additionalValue} onChange={(e) => setForm({ ...form, additionalValue: e.target.value })} /></label>
              <label><span className="label">Unit</span><input className="field" value={form.additionalUnit} onChange={(e) => setForm({ ...form, additionalUnit: e.target.value })} /></label>
              <label><span className="label">Decision</span><select className="field" value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value, reprocessingDecision: e.target.value === 'FAIL' && form.reprocessingDecision })}><option value="PASS">Pass</option><option value="FAIL">Fail</option><option value="HOLD">Hold</option><option value="RETEST">Retest</option></select></label>
              <label className="col-span-2 flex items-end gap-3 rounded-xl border border-slate-200 px-4 py-3"><input type="checkbox" className="h-5 w-5" checked={form.reprocessingDecision} disabled={form.decision !== 'FAIL'} onChange={(e) => setForm({ ...form, reprocessingDecision: e.target.checked })} /><span className="text-sm font-semibold text-slate-700">Approve failed batch for reprocessing</span></label>
              <label className="sm:col-span-2 lg:col-span-3"><span className="label">Comments</span><textarea className="field min-h-24" value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} /></label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setSelected(null)}>Cancel</button><button className="btn-primary" type="submit"><FlaskConical size={17} /> Save result and decision</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
