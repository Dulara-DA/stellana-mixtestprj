import {
  Activity, Bell, Boxes, ClipboardList, FlaskConical, Gauge, LogOut, Mail,
  MenuSquare, PackageSearch, ScrollText, ShieldCheck, Users, Wrench,
} from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { humanize } from '../lib/api'

const commonNav = [
  { to: '/', label: 'Live Dashboard', icon: Gauge },
  { to: '/batches', label: 'Batches', icon: Boxes },
  { to: '/recipes', label: 'Recipes', icon: ClipboardList },
  { to: '/materials', label: 'Material Requests', icon: PackageSearch },
  { to: '/stages', label: 'Mixing Stages', icon: Wrench },
  { to: '/lab', label: 'Laboratory', icon: FlaskConical },
  { to: '/mailbox', label: 'Issue Mailbox', icon: Mail },
  { to: '/notifications', label: 'Notifications', icon: Bell },
]

export function Shell() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigation = [
    ...commonNav,
    ...(user?.role === 'SYSTEM_ADMIN' ? [{ to: '/users', label: 'User Management', icon: Users }] : []),
    ...(['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
      ? [{ to: '/audit', label: 'Audit Log', icon: ScrollText }]
      : []),
  ]

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-72 flex-col bg-ink text-white">
        <div className="border-b border-white/10 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-safety text-ink">
              <Activity size={24} strokeWidth={2.6} />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight">STELLANA</p>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Mixing Control</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Main navigation">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `mb-1 flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-white text-ink shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-process font-bold">
              {user?.fullName.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{user?.fullName}</p>
              <p className="truncate text-xs text-slate-400">{humanize(user?.role ?? '')}</p>
            </div>
          </div>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white">
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="ml-72 min-h-screen">
        <header className="sticky top-0 z-10 flex h-18 items-center justify-between border-b border-slate-200 bg-white/95 px-8 backdrop-blur">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <MenuSquare size={18} />
            <span>Mixing Unit</span>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-700">
              {navigation.find((item) => item.to === location.pathname)?.label ?? 'Production Record'}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Live connection
          </div>
        </header>
        <main className="px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

