import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, Shield, UserCheck, UserX, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { api, displayError, formatDateTime, humanize } from '../lib/api'
import type { Role, User } from '../types'

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ fullName: '', employeeId: '', email: '', password: '', role: 'MIXING_OFFICER' as Role })

  const load = useCallback(async () => {
    try { setUsers(await api<User[]>('/api/users')); setError('') } catch (reason) { setError(displayError(reason)) }
  }, [])
  useEffect(() => { void load() }, [load])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify(form) })
      setShowCreate(false)
      setForm({ fullName: '', employeeId: '', email: '', password: '', role: 'MIXING_OFFICER' })
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  const toggle = async (user: User) => {
    if (!window.confirm(`${user.active ? 'Deactivate' : 'Activate'} ${user.fullName}?`)) return
    try {
      await api(`/api/users/${user.id}/active`, { method: 'PATCH', body: JSON.stringify({ active: !user.active }) })
      await load()
    } catch (reason) { setError(displayError(reason)) }
  }

  return (
    <div>
      <PageHeader eyebrow="System administration" title="User management" description="Manage roles and deactivate accounts without deleting historical ownership records." actions={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={18} /> Add user</button>} />
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {users.map((user) => (
          <div key={user.id} className="card p-5">
            <div className="flex items-start justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600"><Shield size={20} /></div><StatusBadge status={user.active ? 'ACTIVE' : 'INACTIVE'} /></div>
            <h2 className="mt-5 text-lg font-black text-ink">{user.fullName}</h2>
            <p className="mt-1 text-sm text-slate-500">{user.email}</p>
            <p className="mt-2 text-xs font-bold text-slate-500">Employee ID: {user.employeeId ?? 'Not assigned'}</p>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-process">{humanize(user.role)}</p>
            <button className={`mt-5 w-full ${user.active ? 'btn-secondary' : 'btn-primary'}`} onClick={() => toggle(user)}>
              {user.active ? <><UserX size={17} /> Deactivate</> : <><UserCheck size={17} /> Activate</>}
            </button>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-8 backdrop-blur-sm">
          <form onSubmit={create} className="w-full max-w-xl rounded-2xl bg-white p-7 shadow-2xl">
            <div className="mb-6 flex items-start justify-between"><div><h2 className="text-xl font-black text-ink">Create user account</h2><p className="mt-1 text-sm text-slate-500">Future Stores and Lab roles are available but not required.</p></div><button type="button" onClick={() => setShowCreate(false)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100"><X size={19} /></button></div>
            <div className="space-y-4">
              <label><span className="label">Full name</span><input className="field" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
              <label><span className="label">Employee ID</span><input className="field" required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value.toUpperCase() })} placeholder="BLK-002" /></label>
              <label><span className="label">Email</span><input className="field" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label><span className="label">Temporary password</span><input className="field" type="password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
              <label><span className="label">Role</span><select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{['MANAGER', 'MIXING_OFFICER', 'BLANKING_OPERATOR', 'BLANKING_SUPERVISOR', 'MOULDING_OPERATOR', 'MOULDING_SUPERVISOR', 'SYSTEM_ADMIN', 'STORES_OFFICER', 'LAB_OFFICER'].map((role) => <option key={role} value={role}>{humanize(role)}</option>)}</select></label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button><button className="btn-primary" type="submit"><UserCheck size={17} /> Create account</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
