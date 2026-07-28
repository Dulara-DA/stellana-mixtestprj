import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-7 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end sm:gap-6">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-process">{eyebrow}</p>}
        <h1 className="text-3xl font-black tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </div>
  )
}
