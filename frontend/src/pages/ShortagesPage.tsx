import { useCallback, useState, type FormEvent } from 'react'
import { AlertTriangle, MessageSquareReply, Plus, Send } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime, humanize } from '../lib/api'
import type { BlankingBatch, BlankingCart, MaterialShortage, Press, ShortageStatus } from '../types'

const TOPICS = ['/topic/shortages'] as const
const nextHour = () => {
  const value = new Date(Date.now() + 60 * 60 * 1000)
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset())
  return value.toISOString().slice(0, 16)
}

export function ShortagesPage() {
  const { user } = useAuth()
  const canCreate = ['MOULDING_OPERATOR', 'MOULDING_SUPERVISOR', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canLink = ['BLANKING_OPERATOR', 'BLANKING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const [requests, setRequests] = useState<MaterialShortage[]>([])
  const [presses, setPresses] = useState<Press[]>([])
  const [batches, setBatches] = useState<BlankingBatch[]>([])
  const [carts, setCarts] = useState<BlankingCart[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [reply, setReply] = useState('')
  const [form, setForm] = useState({ pressId: '', currentBlankingBatchId: '', requestedBlankQuantity: '', requiredMaterialCode: '', requiredAt: nextHour(), priority: 'HIGH', message: '' })
  const [statusForm, setStatusForm] = useState({ status: 'ACKNOWLEDGED' as ShortageStatus, linkedCartId: '', response: '' })
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [requestData, pressData, batchData, cartData] = await Promise.all([
        api<MaterialShortage[]>('/api/shortages'),
        api<Press[]>('/api/moulding/presses'),
        api<BlankingBatch[]>('/api/blanking/batches').catch(() => []),
        api<BlankingCart[]>('/api/blanking/carts'),
      ])
      setRequests(requestData)
      setPresses(pressData)
      setBatches(batchData)
      setCarts(cartData)
      setSelectedId((current) => current ?? requestData[0]?.id ?? null)
      setError('')
    } catch (reason) { setError(displayError(reason)) }
  }, [])
  const connected = useRealtimeRefresh(load, TOPICS)
  const selected = requests.find((request) => request.id === selectedId) ?? null

  const create = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await api('/api/shortages', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          pressId: Number(form.pressId),
          currentBlankingBatchId: form.currentBlankingBatchId ? Number(form.currentBlankingBatchId) : null,
          requestedBlankQuantity: Number(form.requestedBlankQuantity),
          requiredAt: form.requiredAt,
        }),
      })
      setForm({ pressId: '', currentBlankingBatchId: '', requestedBlankQuantity: '', requiredMaterialCode: '', requiredAt: nextHour(), priority: 'HIGH', message: '' })
      setShowCreate(false)
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const addMessage = async () => {
    if (!selected || !reply.trim()) return
    try {
      await api(`/api/shortages/${selected.id}/messages`, { method: 'POST', body: JSON.stringify({ message: reply }) })
      setReply('')
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const changeStatus = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    try {
      await api(`/api/shortages/${selected.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: statusForm.status,
          linkedCartId: statusForm.linkedCartId ? Number(statusForm.linkedCartId) : null,
          response: statusForm.response,
        }),
      })
      setStatusForm({ status: 'ACKNOWLEDGED', linkedCartId: '', response: '' })
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Cross-section mailbox"
        title="Material shortage requests"
        description="Moulding requests blanks from Blanking, with immutable conversation history, cart linking and real-time status."
        actions={<div className="flex gap-3"><LiveIndicator connected={connected} />{canCreate && <button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={17} /> Request blanks</button>}</div>}
      />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="card grid min-h-[38rem] overflow-hidden lg:grid-cols-[22rem_1fr]">
        <aside className="border-b border-slate-200 bg-slate-50/70 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-200 p-4 text-xs font-bold uppercase tracking-wide text-slate-500">{requests.length} requests</div>
          <div className="max-h-72 overflow-y-auto lg:max-h-[40rem]">
            {requests.map((request) => (
              <button key={request.id} onClick={() => setSelectedId(request.id)} className={`w-full border-b border-slate-200 p-4 text-left ${selectedId === request.id ? 'bg-white shadow-[inset_3px_0_0_#2685ff]' : 'hover:bg-white'}`}>
                <div className="flex items-center justify-between gap-2"><StatusBadge status={request.priority} /><StatusBadge status={request.status} /></div>
                <p className="mt-3 font-black text-ink">{request.requestNumber}</p>
                <p className="mt-1 text-xs text-slate-500">{request.pressNumber} · {request.requestedBlankQuantity} {request.requiredMaterialCode} blanks</p>
                <p className="mt-1 text-xs text-slate-400">Required {formatDateTime(request.requiredAt)}</p>
              </button>
            ))}
          </div>
        </aside>

        {selected ? (
          <section className="flex min-w-0 flex-col">
            <header className="border-b border-slate-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><div className="mb-2 flex gap-2"><StatusBadge status={selected.priority} /><StatusBadge status={selected.status} /></div><h2 className="text-xl font-black">{selected.requestNumber} · {selected.pressNumber}</h2><p className="mt-1 text-sm text-slate-500">{selected.requestedBlankQuantity} {selected.requiredMaterialCode} blanks · available when requested: {selected.currentAvailableBlankQuantity}</p></div>
                <div className="text-right text-xs text-slate-500"><p>{selected.sender.fullName} · {selected.senderEmployeeId}</p><p>{selected.productionDate} · {humanize(selected.senderShift)}</p></div>
              </div>
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/50 p-5">
              {selected.messages.map((message) => {
                const mine = message.sender.id === user?.id
                return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 ${mine ? 'bg-process text-white' : 'border border-slate-200 bg-white'}`}><p className={`text-xs font-bold ${mine ? 'text-blue-100' : 'text-slate-500'}`}>{message.sender.fullName} · {humanize(message.statusSnapshot)}</p><p className="mt-2 text-sm leading-6">{message.message}</p><p className={`mt-2 text-[11px] ${mine ? 'text-blue-100' : 'text-slate-400'}`}>{formatDateTime(message.sentAt)}</p></div></div>
              })}
            </div>
            <div className="border-t border-slate-200 bg-white p-5">
              {canLink && !['FULFILLED', 'CANCELLED'].includes(selected.status) && (
                <form onSubmit={changeStatus} className="mb-5 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-3">
                  <label><span className="label">Update status</span><select className="field" value={statusForm.status} onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value as ShortageStatus })}>{['ACKNOWLEDGED', 'PREPARING', 'DISPATCHED', 'FULFILLED', 'CANCELLED'].map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select></label>
                  <label><span className="label">Link cart (when applicable)</span><select className="field" value={statusForm.linkedCartId} onChange={(e) => setStatusForm({ ...statusForm, linkedCartId: e.target.value })}><option value="">No cart selected</option>{carts.filter((cart) => cart.destinationPressId === selected.pressId).map((cart) => <option key={cart.id} value={cart.id}>{cart.cartNumber} · {cart.status}</option>)}</select></label>
                  <label><span className="label">Response note</span><input className="field" value={statusForm.response} onChange={(e) => setStatusForm({ ...statusForm, response: e.target.value })} /></label>
                  <div className="md:col-span-3 flex justify-end"><button className="btn-secondary">Save status</button></div>
                </form>
              )}
              <div className="flex items-end gap-3"><label className="flex-1"><span className="label">Conversation reply</span><textarea className="field min-h-20" value={reply} onChange={(e) => setReply(e.target.value)} /></label><button className="btn-primary mb-0.5" onClick={addMessage} disabled={!reply.trim()}><MessageSquareReply size={17} /> Send</button></div>
            </div>
          </section>
        ) : <div className="grid place-items-center p-10 text-center"><div><AlertTriangle className="mx-auto text-slate-300" size={34} /><p className="mt-3 font-bold">No shortage selected</p></div></div>}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/60 p-4">
          <form onSubmit={create} className="my-6 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5"><h2 className="text-xl font-black">Request blanks from Blanking</h2><p className="mt-1 text-sm text-slate-500">The server stores current press inventory, shift, date and sender employee ID.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="label">Press</span><select className="field" required value={form.pressId} onChange={(e) => setForm({ ...form, pressId: e.target.value })}><option value="">Select press</option>{presses.map((press) => <option key={press.id} value={press.id}>{press.pressNumber} · {press.availableBlankQuantity} blanks available</option>)}</select></label>
              <label><span className="label">Current Blanking batch (optional)</span><select className="field" value={form.currentBlankingBatchId} onChange={(e) => setForm({ ...form, currentBlankingBatchId: e.target.value })}><option value="">Not known / no current batch</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNumber} · {batch.materialCode}</option>)}</select></label>
              <label><span className="label">Requested blanks</span><input className="field" required min="1" type="number" value={form.requestedBlankQuantity} onChange={(e) => setForm({ ...form, requestedBlankQuantity: e.target.value })} /></label>
              <label><span className="label">Required material code</span><input className="field" required value={form.requiredMaterialCode} onChange={(e) => setForm({ ...form, requiredMaterialCode: e.target.value })} /></label>
              <label><span className="label">Required date and time</span><input className="field" required type="datetime-local" value={form.requiredAt} onChange={(e) => setForm({ ...form, requiredAt: e.target.value })} /></label>
              <label><span className="label">Priority</span><select className="field" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></label>
              <label className="sm:col-span-2"><span className="label">Operational message</span><textarea className="field min-h-28" required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button><button className="btn-primary"><Send size={17} /> Send request</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
