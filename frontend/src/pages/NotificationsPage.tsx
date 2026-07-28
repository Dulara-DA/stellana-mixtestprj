import { useCallback, useEffect, useState } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { Bell, CheckCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { api, displayError, formatDateTime, humanize } from '../lib/api'
import type { Notification } from '../types'

export function NotificationsPage() {
  const { user, token } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try { setNotifications(await api<Notification[]>('/api/notifications')); setError('') }
    catch (reason) { setError(displayError(reason)) }
  }, [])

  useEffect(() => {
    void load()
    if (!token || !user) return
    const client = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8080/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      onConnect: () => client.subscribe(`/topic/notifications/${user.id}`, () => void load()),
    })
    client.activate()
    return () => { void client.deactivate() }
  }, [load, token, user])

  const markRead = async (id: number) => {
    try { await api(`/api/notifications/${id}/read`, { method: 'POST' }); await load() }
    catch (reason) { setError(displayError(reason)) }
  }

  return (
    <div>
      <PageHeader eyebrow="Real-time alerts" title="Notifications" description="Important batch changes, material issues, laboratory decisions, and mailbox activity." />
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {notifications.length === 0 ? (
        <EmptyState title="No notifications yet" message="Operational alerts will appear here as workflow events occur." />
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div key={notification.id} className={`card flex items-center gap-5 p-5 ${notification.read ? 'opacity-70' : 'border-l-4 border-l-process'}`}>
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${notification.read ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-process'}`}><Bell size={20} /></div>
              <div className="flex-1"><div className="flex items-center gap-3"><p className="font-black text-ink">{notification.title}</p><span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{humanize(notification.type)}</span></div><p className="mt-1 text-sm text-slate-600">{notification.message}</p><p className="mt-2 text-xs text-slate-400">{formatDateTime(notification.createdAt)}</p></div>
              {!notification.read && <button className="btn-secondary" onClick={() => markRead(notification.id)}><CheckCheck size={17} /> Mark read</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

