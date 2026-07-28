import { RadioTower } from 'lucide-react'

export function LiveIndicator({ connected }: { connected: boolean }) {
  return (
    <div
      className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${
        connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
      }`}
      title={connected ? 'Real-time connection active' : 'Polling every 30 seconds while reconnecting'}
    >
      <RadioTower size={15} />
      <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {connected ? 'Live' : 'Reconnecting'}
    </div>
  )
}
