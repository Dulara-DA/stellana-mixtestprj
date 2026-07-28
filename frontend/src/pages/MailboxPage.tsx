import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { CheckCircle2, MailPlus, MessageSquareReply, Send, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { api, displayError, formatDateTime, humanize } from '../lib/api'
import type { Batch, Issue } from '../types'

export function MailboxPage() {
  const { user, token } = useAuth()
  const [issues, setIssues] = useState<Issue[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ batchId: '', priority: 'MEDIUM', subject: '', message: '' })

  const load = useCallback(async () => {
    try {
      const [issueData, batchData] = await Promise.all([api<Issue[]>('/api/issues'), api<Batch[]>('/api/batches')])
      setIssues(issueData)
      setBatches(batchData)
      setSelectedId((current) => current ?? issueData[0]?.id ?? null)
      setError('')
    } catch (reason) { setError(displayError(reason)) }
  }, [])

  useEffect(() => {
    void load()
    if (!token) return
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      onConnect: () => client.subscribe('/topic/issues', () => void load()),
    })
    client.activate()
    return () => { void client.deactivate() }
  }, [load, token])

  const selected = issues.find((issue) => issue.id === selectedId) ?? null

  const create = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const issue = await api<Issue>('/api/issues', {
        method: 'POST',
        body: JSON.stringify({ ...form, batchId: form.batchId ? Number(form.batchId) : null }),
      })
      setShowCreate(false)
      setForm({ batchId: '', priority: 'MEDIUM', subject: '', message: '' })
      await load()
      setSelectedId(issue.id)
    } catch (reason) { setError(displayError(reason)) }
  }

  const sendReply = async () => {
    if (!selected || !reply.trim()) return
    try {
      await api(`/api/issues/${selected.id}/reply`, { method: 'POST', body: JSON.stringify({ message: reply }) })
      setReply('')
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const changeStatus = async (status: Issue['status']) => {
    if (!selected) return
    try {
      await api(`/api/issues/${selected.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Internal communication"
        title="Mixing issue mailbox"
        description="Batch-linked operational issues, manager replies, priorities, and resolution status in one auditable conversation."
        actions={<button className="btn-primary" onClick={() => setShowCreate(true)}><MailPlus size={18} /> Report issue</button>}
      />
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="card grid min-h-[42rem] overflow-hidden lg:grid-cols-[22rem_1fr]">
        <aside className="border-b border-slate-200 bg-slate-50/70 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{issues.length} conversations</p></div>
          <div className="max-h-72 overflow-y-auto lg:max-h-[40rem]">
            {issues.map((issue) => {
              const unread = user?.role === 'MIXING_OFFICER' ? issue.unreadByOfficer : issue.unreadByManager
              return (
                <button key={issue.id} onClick={() => setSelectedId(issue.id)} className={`w-full border-b border-slate-200 p-4 text-left transition ${selectedId === issue.id ? 'bg-white shadow-[inset_3px_0_0_#2685ff]' : 'hover:bg-white'}`}>
                  <div className="flex items-center justify-between gap-3"><StatusBadge status={issue.priority} />{unread && <span className="h-2.5 w-2.5 rounded-full bg-process" />}</div>
                  <p className="mt-3 truncate text-sm font-black text-ink">{issue.subject}</p>
                  <p className="mt-1 text-xs text-slate-500">{issue.batchNumber ?? 'General issue'} · {formatDateTime(issue.updatedAt)}</p>
                  <div className="mt-3"><StatusBadge status={issue.status} /></div>
                </button>
              )
            })}
          </div>
        </aside>

        {selected ? (
          <section className="flex min-w-0 flex-col">
            <header className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div><div className="mb-2 flex items-center gap-2"><StatusBadge status={selected.priority} /><StatusBadge status={selected.status} /></div><h2 className="text-xl font-black text-ink">{selected.subject}</h2><p className="mt-1 text-sm text-slate-500">{selected.batchNumber ?? 'No batch selected'} · Opened by {selected.createdBy.fullName}</p></div>
              <select className="field w-52" value={selected.status} onChange={(event) => changeStatus(event.target.value as Issue['status'])}>
                {['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
              </select>
            </header>
            <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50/50 p-6">
              {selected.messages.map((message) => {
                const mine = message.sender.id === user?.id
                return (
                  <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[72%] rounded-2xl px-5 py-4 ${mine ? 'rounded-br-md bg-process text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-700'}`}>
                      <p className={`mb-2 text-xs font-bold ${mine ? 'text-blue-100' : 'text-slate-400'}`}>{message.sender.fullName} · {humanize(message.sender.role)}</p>
                      <p className="text-sm leading-6">{message.message}</p>
                      <p className={`mt-2 text-[11px] ${mine ? 'text-blue-100' : 'text-slate-400'}`}>{formatDateTime(message.sentAt)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            {selected.status !== 'CLOSED' && (
              <div className="border-t border-slate-200 bg-white p-5">
                <div className="flex items-end gap-3">
                  <label className="flex-1"><span className="label">Reply</span><textarea className="field min-h-24" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Type a clear operational response…" /></label>
                  <button className="btn-primary mb-0.5" onClick={sendReply} disabled={!reply.trim()}><MessageSquareReply size={18} /> Send reply</button>
                </div>
              </div>
            )}
          </section>
        ) : (
          <div className="grid place-items-center text-center text-slate-500"><div><Send className="mx-auto mb-3 text-slate-300" size={32} /><p className="font-bold">Select a conversation</p></div></div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-8 backdrop-blur-sm">
          <form onSubmit={create} className="w-full max-w-2xl rounded-2xl bg-white p-7 shadow-2xl">
            <div className="mb-6 flex items-start justify-between"><div><h2 className="text-xl font-black text-ink">Report a mixing issue</h2><p className="mt-1 text-sm text-slate-500">The manager will receive a real-time notification.</p></div><button type="button" onClick={() => setShowCreate(false)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100" aria-label="Close"><X size={19} /></button></div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="col-span-2"><span className="label">Batch (optional)</span><select className="field" value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })}><option value="">General mixing issue</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNumber} · {batch.status.replaceAll('_', ' ')}</option>)}</select></label>
              <label><span className="label">Priority</span><select className="field" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
              <label className="col-span-3"><span className="label">Subject</span><input className="field" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
              <label className="col-span-3"><span className="label">Message</span><textarea className="field min-h-32" required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button><button type="submit" className="btn-primary"><Send size={17} /> Send to manager</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
