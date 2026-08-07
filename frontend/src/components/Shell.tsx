import {
  Activity, AlertTriangle, ArrowLeftRight, BarChart3, Bell, Boxes, CircleDot, ClipboardList, Factory,
  FlaskConical, Gauge, Grid3X3, LogOut, Mail, PackageSearch, ScrollText, Truck, Users, Wrench,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api, humanize } from '../lib/api'
import type { ShiftContext } from '../types'
import { BrandLogo } from './BrandLogo'

type NavItem = { to: string; label: string; icon: typeof Activity }

const mixingNav: NavItem[] = [
  { to: '/mixing', label: 'Live Dashboard', icon: Gauge },
  { to: '/batches', label: 'Batches', icon: Boxes },
  { to: '/recipes', label: 'Recipes', icon: ClipboardList },
  { to: '/materials', label: 'Material Requests', icon: PackageSearch },
  { to: '/stages', label: 'Mixing Stages', icon: Wrench },
  { to: '/lab', label: 'Laboratory', icon: FlaskConical },
  { to: '/mailbox', label: 'Issue Mailbox', icon: Mail },
  { to: '/notifications', label: 'Notifications', icon: Bell },
]
const blankingNav: NavItem[] = [
  { to: '/blanking', label: 'Blanking Dashboard', icon: Gauge },
  { to: '/blanking/stock', label: 'Compound Stock', icon: PackageSearch },
  { to: '/blanking/batches', label: 'Blanking Batches', icon: Factory },
  { to: '/blanking/carts', label: 'Carts & Dispatch', icon: Truck },
  { to: '/blanking/returns', label: 'Return Confirmation', icon: ArrowLeftRight },
  { to: '/blanking/moulding', label: 'Moulding Status', icon: CircleDot },
  { to: '/shortages', label: 'Shortage Requests', icon: AlertTriangle },
]
const mouldingNav: NavItem[] = [
  { to: '/moulding', label: 'Moulding Dashboard', icon: Gauge },
  { to: '/moulding/receipts', label: 'Receiving History', icon: PackageSearch },
  { to: '/moulding/production', label: 'Production Entry', icon: CircleDot },
  { to: '/moulding/returns', label: 'Blank Return', icon: ArrowLeftRight },
  { to: '/shortages', label: 'Request Blanks', icon: AlertTriangle },
]

function NavigationLinks({ navigation, mobile = false }: { navigation: NavItem[]; mobile?: boolean }) {
  return (
    <>
      {navigation.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={['/mixing', '/blanking', '/moulding'].includes(to)}
          className={({ isActive }) =>
            mobile
              ? `flex min-h-12 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold ${isActive ? 'bg-process text-white' : 'bg-white text-slate-700'}`
              : `mb-1 flex min-h-12 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                isActive ? 'bg-white text-ink shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`
          }
        >
          <Icon size={mobile ? 17 : 19} />
          {label}
        </NavLink>
      ))}
    </>
  )
}

export function Shell() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [shift, setShift] = useState<ShiftContext | null>(null)
  const isBlanking = location.pathname.startsWith('/blanking')
  const isMoulding = location.pathname.startsWith('/moulding') || location.pathname === '/shortages'
  const sectionName = isBlanking ? 'Blanking' : isMoulding ? 'Moulding' : 'Mixing'
  let navigation = isBlanking ? blankingNav : isMoulding ? mouldingNav : mixingNav
  if (!isBlanking && !isMoulding && user?.role === 'LAB_OFFICER') {
    navigation = mixingNav.filter((item) => ['/mixing', '/lab'].includes(item.to))
  }
  if (!isBlanking && !isMoulding && user?.role === 'STORES_OFFICER') {
    navigation = mixingNav.filter((item) => ['/mixing', '/materials'].includes(item.to))
  }
  if (['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')) {
    navigation = [...navigation, { to: '/production-manager', label: 'Production Report', icon: BarChart3 }]
  }
  if (user?.role === 'SYSTEM_ADMIN') navigation = [...navigation, { to: '/users', label: 'User Management', icon: Users }]
  if (['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')) navigation = [...navigation, { to: '/audit', label: 'Audit Log', icon: ScrollText }]

  useEffect(() => {
    void api<ShiftContext>('/api/production/shift').then(setShift).catch(() => setShift(null))
  }, [location.pathname])

  const currentLabel = navigation.find((item) =>
    item.to === location.pathname || (item.to !== '/mixing' && location.pathname.startsWith(`${item.to}/`)),
  )?.label ?? 'Production record'

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 flex-col bg-ink text-white lg:flex">
        <div className="border-b border-white/10 px-6 py-6">
          <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
            <BrandLogo className="h-auto w-full" eager />
          </div>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{sectionName} Control</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label={`${sectionName} navigation`}>
          <NavLink to="/" className="mb-4 flex min-h-12 items-center gap-3 rounded-xl border border-white/10 px-3.5 text-sm font-bold text-slate-300 hover:bg-white/10 hover:text-white"><Grid3X3 size={19} /> Select section</NavLink>
          <NavigationLinks navigation={navigation} />
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-process font-bold">{user?.fullName.charAt(0)}</div>
            <div className="min-w-0"><p className="truncate text-sm font-bold">{user?.fullName}</p><p className="truncate text-xs text-slate-400">{user?.employeeId ?? 'ID TBC'} · {humanize(user?.role ?? '')}</p></div>
          </div>
          <button onClick={logout} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"><LogOut size={18} /> Sign out</button>
        </div>
      </aside>

      <div className="min-h-screen lg:ml-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:h-18 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <NavLink to="/" className="flex h-11 w-20 shrink-0 items-center rounded-xl border border-slate-200 bg-white p-1 lg:hidden" aria-label="Select production section"><BrandLogo className="h-full w-full" eager /></NavLink>
              <div className="min-w-0"><p className="truncate text-sm font-black text-ink">{sectionName} · {currentLabel}</p><p className="truncate text-xs text-slate-500">{shift ? `${humanize(shift.shift)} · ${shift.productionDate}` : 'Production Tracking'}</p></div>
            </div>
            <button onClick={logout} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-600 lg:hidden" aria-label="Sign out"><LogOut size={19} /></button>
            <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 lg:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Server shift: {shift ? humanize(shift.shift) : 'Loading'}</div>
          </div>
          <nav className="flex gap-2 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden" aria-label={`${sectionName} tablet navigation`}>
            <NavLink to="/" className="flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-ink px-3 text-sm font-bold text-white"><Grid3X3 size={17} /> Sections</NavLink>
            <NavigationLinks navigation={navigation} mobile />
          </nav>
        </header>
        <main className="px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8"><Outlet /></main>
      </div>
    </div>
  )
}
