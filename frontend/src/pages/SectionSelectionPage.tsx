import { Activity, ArrowRight, CircleDot, Layers3, LogOut } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BrandLogo } from '../components/BrandLogo'
import { api, formatDateTime, humanize } from '../lib/api'
import type { Role, ShiftContext } from '../types'

const sections: Array<{
  title: string
  description: string
  to: string
  roles: Role[]
  icon: typeof Activity
}> = [
  {
    title: 'Mixing',
    description: 'Recipes, material issue, two-stage mixing and laboratory release',
    to: '/mixing',
    roles: ['MANAGER', 'MIXING_OFFICER', 'SYSTEM_ADMIN', 'STORES_OFFICER', 'LAB_OFFICER'],
    icon: Activity,
  },
  {
    title: 'Blanking',
    description: 'Approved material, blank production, carts and press supply',
    to: '/blanking',
    roles: ['MANAGER', 'SYSTEM_ADMIN', 'BLANKING_OPERATOR', 'BLANKING_SUPERVISOR'],
    icon: Layers3,
  },
  {
    title: 'Moulding',
    description: 'Press inventory, cart receipts, tyre output and shortages',
    to: '/moulding',
    roles: ['MANAGER', 'SYSTEM_ADMIN', 'MOULDING_OPERATOR', 'MOULDING_SUPERVISOR'],
    icon: CircleDot,
  },
]

export function SectionSelectionPage() {
  const { user, logout } = useAuth()
  const [shift, setShift] = useState<ShiftContext | null>(null)
  const load = useCallback(() => api<ShiftContext>('/api/production/shift').then(setShift), [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  const visible = sections.filter((section) => user && section.roles.includes(user.role))

  return (
    <main className="min-h-screen bg-ink px-5 py-8 text-white sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5">
        <div>
          <div className="rounded-2xl bg-white px-4 py-2.5 shadow-lg shadow-black/10">
            <BrandLogo className="h-auto w-52" eager />
          </div>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Production tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-bold">{user?.fullName}</p>
            <p className="text-xs text-slate-400">
              {user?.employeeId ?? 'Employee ID TBC'} · {humanize(user?.role ?? '')}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="grid h-12 w-12 place-items-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/10"
            aria-label="Sign out"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <section className="mx-auto flex max-w-6xl flex-col items-center py-12 text-center sm:py-16">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-safety">Choose a production area</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Factory production control</h1>
        <p className="mt-4 text-sm text-slate-300">
          {shift
            ? `${humanize(shift.shift)} · Production date ${shift.productionDate} · ${formatDateTime(shift.serverTime)}`
            : 'Loading server shift…'}
        </p>

        <div className="mt-10 flex w-full flex-col items-center gap-7">
          {visible.map(({ title, description, to, icon: Icon }) => (
            <div key={title} className="flex flex-col items-center">
              <Link
                to={to}
                className="group flex h-56 w-56 flex-col items-center justify-center rounded-full border-4 border-blue-300/20 bg-process px-8 text-white shadow-2xl shadow-blue-950/30 transition hover:-translate-y-1 hover:bg-blue-600 focus-visible:outline-white sm:h-64 sm:w-64"
              >
                <Icon size={44} />
                <h2 className="mt-4 text-center text-xl font-black uppercase tracking-wide sm:text-2xl">
                  {title} Section
                </h2>
                <span className="mt-3 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider">
                  Open <ArrowRight size={16} className="transition group-hover:translate-x-1" />
                </span>
              </Link>
              <p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">{description}</p>
            </div>
          ))}
        </div>

        {visible.length === 0 && (
          <div className="mt-12 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6 text-amber-100">
            This account has no production section assigned. Ask a System Administrator to update the role.
          </div>
        )}
      </section>
    </main>
  )
}
