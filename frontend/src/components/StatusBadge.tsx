import { humanize } from '../lib/api'

const statusStyles: Record<string, string> = {
  STAGE_1_IN_PROGRESS: 'bg-blue-100 text-blue-700 ring-blue-200',
  STAGE_2_IN_PROGRESS: 'bg-blue-100 text-blue-700 ring-blue-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 ring-blue-200',
  ACTIVE: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  COMPLETED_ON_TIME: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  READY: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  FULLY_DISPATCHED: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  FULLY_CONSUMED: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  FULFILLED: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  RECEIVED_AT_MOULDING: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  ISSUED: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  PASS: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  LAB_PASSED: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  RELEASED_TO_BLANKING: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  WAITING_FOR_MATERIALS: 'bg-amber-100 text-amber-800 ring-amber-200',
  SCHEDULED: 'bg-violet-100 text-violet-700 ring-violet-200',
  READY_TO_START: 'bg-sky-100 text-sky-700 ring-sky-200',
  DUE_SOON: 'bg-amber-100 text-amber-800 ring-amber-200',
  MATERIALS_REQUESTED: 'bg-amber-100 text-amber-800 ring-amber-200',
  WAITING_FOR_LAB: 'bg-amber-100 text-amber-800 ring-amber-200',
  SAMPLE_SENT_TO_LAB: 'bg-amber-100 text-amber-800 ring-amber-200',
  ON_HOLD: 'bg-amber-100 text-amber-800 ring-amber-200',
  RETEST_REQUIRED: 'bg-amber-100 text-amber-800 ring-amber-200',
  PENDING: 'bg-amber-100 text-amber-800 ring-amber-200',
  TEMPORARY_LAB_BYPASS: 'bg-amber-100 text-amber-950 ring-amber-400',
  REQUESTED: 'bg-amber-100 text-amber-800 ring-amber-200',
  PARTIALLY_ISSUED: 'bg-amber-100 text-amber-800 ring-amber-200',
  PREPARED: 'bg-amber-100 text-amber-800 ring-amber-200',
  PARTIALLY_DISPATCHED: 'bg-amber-100 text-amber-800 ring-amber-200',
  PARTIALLY_CONSUMED: 'bg-amber-100 text-amber-800 ring-amber-200',
  WAITING_FOR_BLANKS: 'bg-amber-100 text-amber-800 ring-amber-200',
  ACKNOWLEDGED: 'bg-amber-100 text-amber-800 ring-amber-200',
  PREPARING: 'bg-amber-100 text-amber-800 ring-amber-200',
  FAIL: 'bg-red-100 text-red-700 ring-red-200',
  LAB_FAILED: 'bg-red-100 text-red-700 ring-red-200',
  STOPPED: 'bg-red-100 text-red-700 ring-red-200',
  OVERDUE: 'bg-red-100 text-red-700 ring-red-200',
  COMPLETED_LATE: 'bg-orange-100 text-orange-700 ring-orange-200',
  URGENT: 'bg-red-100 text-red-700 ring-red-200',
  REPROCESSING: 'bg-red-100 text-red-700 ring-red-200',
  MAINTENANCE: 'bg-red-100 text-red-700 ring-red-200',
  HIGH: 'bg-orange-100 text-orange-700 ring-orange-200',
  DISPATCHED: 'bg-blue-100 text-blue-700 ring-blue-200',
  RUNNING: 'bg-blue-100 text-blue-700 ring-blue-200',
  IDLE: 'bg-slate-100 text-slate-700 ring-slate-200',
  PLANNED: 'bg-slate-100 text-slate-700 ring-slate-200',
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-200',
  OBSOLETE: 'bg-slate-100 text-slate-600 ring-slate-200',
  CANCELLED: 'bg-slate-100 text-slate-500 ring-slate-200',
}

export function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? 'bg-slate-100 text-slate-700 ring-slate-200'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${style}`}>
      {humanize(status)}
    </span>
  )
}
