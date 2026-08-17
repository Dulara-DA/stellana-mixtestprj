import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, FlaskConical, PackageSearch, ShieldCheck } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { StatusBadge } from '../components/StatusBadge'
import { api, displayError, formatDateTime, humanize } from '../lib/api'

interface TraceabilityRecord {
  batchNumber: string
  factoryReference: string
  recipeCode: string
  compoundName: string
  revisionNumber: string
  plannedQuantityKg: number
  actualOutputQuantityKg?: number
  machine: string
  currentStatus: string
  laboratoryDecision: string
  sampleId?: string
  testDateTime?: string
  releaseStatus: string
  stage1StartedAt?: string
  stage1CompletedAt?: string
  stage2StartedAt?: string
  stage2CompletedAt?: string
}

export function TraceabilityPage() {
  const { code } = useParams()
  const [batch, setBatch] = useState<TraceabilityRecord | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<TraceabilityRecord>(`/api/public/trace/${code}`).then(setBatch).catch((reason) => setError(displayError(reason)))
  }, [code])

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <BrandLogo className="h-auto w-48" eager />
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.17em] text-slate-500">Batch traceability</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"><ShieldCheck size={15} /> Safe production reference</div>
        </header>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>}
        {!batch && !error && <div className="card p-8 text-sm text-slate-500">Loading traceability record…</div>}

        {batch && (
          <>
            <section className="overflow-hidden rounded-3xl bg-ink text-white shadow-panel">
              <div className="grid gap-5 px-5 py-6 sm:grid-cols-[1fr_auto] sm:items-end sm:gap-8 sm:px-8 sm:py-9">
                <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Verified factory reference</p><h1 className="mt-3 break-words text-3xl font-black tracking-tight sm:text-4xl">{batch.factoryReference}</h1><p className="mt-2 text-slate-300">{batch.compoundName} · Batch {batch.batchNumber}</p></div>
                <StatusBadge status={batch.currentStatus} />
              </div>
              <div className="grid border-t border-white/10 sm:grid-cols-3">
                <div className="border-b border-white/10 p-5 sm:border-b-0 sm:border-r sm:p-6"><p className="text-xs uppercase tracking-wide text-slate-500">Recipe</p><p className="mt-2 text-lg font-black">{batch.recipeCode}</p></div>
                <div className="border-b border-white/10 p-5 sm:border-b-0 sm:border-r sm:p-6"><p className="text-xs uppercase tracking-wide text-slate-500">Exact revision</p><p className="mt-2 text-lg font-black">Revision {batch.revisionNumber}</p></div>
                <div className="p-5 sm:p-6"><p className="text-xs uppercase tracking-wide text-slate-500">Quantity</p><p className="mt-2 text-lg font-black">{batch.actualOutputQuantityKg ?? batch.plannedQuantityKg} kg</p></div>
              </div>
            </section>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <section className="card p-6">
                <h2 className="flex items-center gap-3 text-lg font-black text-ink"><CalendarDays className="text-process" size={20} /> Mixing dates</h2>
                <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-400">Stage 1 IN</dt><dd className="mt-1 font-bold">{formatDateTime(batch.stage1StartedAt)}</dd></div>
                  <div><dt className="text-xs text-slate-400">Stage 1 OUT</dt><dd className="mt-1 font-bold">{formatDateTime(batch.stage1CompletedAt)}</dd></div>
                  <div><dt className="text-xs text-slate-400">Stage 2 IN</dt><dd className="mt-1 font-bold">{formatDateTime(batch.stage2StartedAt)}</dd></div>
                  <div><dt className="text-xs text-slate-400">Stage 2 OUT</dt><dd className="mt-1 font-bold">{formatDateTime(batch.stage2CompletedAt)}</dd></div>
                </dl>
              </section>
              <section className="card p-6">
                <h2 className="flex items-center gap-3 text-lg font-black text-ink"><FlaskConical className="text-violet-600" size={20} /> Quality and release</h2>
                <div className="mt-5 space-y-4">
                  <div className="flex flex-col items-start gap-2 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm text-slate-500">Laboratory decision</span><StatusBadge status={batch.laboratoryDecision} /></div>
                  <div className="flex flex-col items-start gap-2 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm text-slate-500">Sample / test date</span><span className="text-left text-sm font-black text-ink sm:text-right">{batch.sampleId ?? 'Not tested'}<br /><small className="font-medium text-slate-500">{formatDateTime(batch.testDateTime)}</small></span></div>
                  <div className="flex flex-col items-start gap-2 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm text-slate-500">Release status</span><span className="text-sm font-black text-ink">{humanize(batch.releaseStatus)}</span></div>
                </div>
              </section>
            </div>
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-800">
              <CheckCircle2 className="shrink-0" size={20} />
              This page identifies the controlled production record. Authentication and user information are not encoded in the QR code.
            </div>
          </>
        )}
      </div>
    </main>
  )
}
