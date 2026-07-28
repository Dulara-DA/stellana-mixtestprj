import { Inbox } from 'lucide-react'

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="card flex min-h-64 flex-col items-center justify-center px-8 text-center">
      <div className="mb-4 rounded-2xl bg-slate-100 p-4 text-slate-500">
        <Inbox size={28} />
      </div>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{message}</p>
    </div>
  )
}

