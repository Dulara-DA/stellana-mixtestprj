import { useState, type FormEvent } from 'react'
import { Activity, ArrowRight, Factory, LockKeyhole, RadioTower } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { displayError, SESSION_MESSAGE_KEY } from '../lib/api'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionMessage] = useState(() => {
    const message = sessionStorage.getItem(SESSION_MESSAGE_KEY) ?? ''
    sessionStorage.removeItem(SESSION_MESSAGE_KEY)
    return message
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (reason) {
      setError(displayError(reason))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen min-w-[1180px] grid-cols-[1.12fr_0.88fr] bg-ink">
      <section className="relative flex overflow-hidden px-16 py-14 text-white">
        <div className="absolute -left-32 top-20 h-96 w-96 rounded-full border-[70px] border-white/[0.025]" />
        <div className="absolute bottom-[-14rem] right-[-8rem] h-[34rem] w-[34rem] rounded-full border-[90px] border-process/10" />
        <div className="relative z-10 flex w-full flex-col">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-safety text-ink">
              <Activity size={27} strokeWidth={2.8} />
            </div>
            <div>
              <p className="text-xl font-black tracking-tight">STELLANA</p>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Mixing Unit</p>
            </div>
          </div>

          <div className="my-auto max-w-2xl py-16">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-300">
              <RadioTower size={16} className="text-emerald-400" />
              Real-time production control
            </div>
            <h1 className="text-6xl font-black leading-[1.02] tracking-[-0.05em]">
              Every batch.
              <br />
              Every revision.
              <br />
              <span className="text-safety">Fully traceable.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300">
              A single operational view of mixing activity, material movement, laboratory decisions,
              and production issues.
            </p>

            <div className="mt-12 grid grid-cols-3 gap-4">
              {[
                ['Live', 'Batch status'],
                ['Exact', 'Recipe revision'],
                ['Complete', 'Audit history'],
              ].map(([value, label]) => (
                <div key={label} className="border-l-2 border-process/60 pl-4">
                  <p className="text-lg font-black">{value}</p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-500">First prototype · Authorized factory personnel only</p>
        </div>
      </section>

      <section className="flex items-center justify-center bg-slate-100 p-12">
        <div className="w-full max-w-md">
          <div className="mb-9">
            <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-blue-100 text-process">
              <Factory size={25} />
            </div>
            <h2 className="text-3xl font-black tracking-tight text-ink">Production sign in</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use your Stellana Mixing Control account to continue.
            </p>
          </div>

          <form onSubmit={submit} className="card p-7">
            {sessionMessage && (
              <div
                role="status"
                className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"
              >
                {sessionMessage}
              </div>
            )}
            {error && (
              <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}
            <label className="mb-5 block">
              <span className="label">Email address</span>
              <input
                className="field"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@stellana.local"
                required
              />
            </label>
            <label className="mb-6 block">
              <span className="label">Password</span>
              <div className="relative">
                <LockKeyhole className="absolute left-3.5 top-3 text-slate-400" size={18} />
                <input
                  className="field pl-11"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                  required
                />
              </div>
            </label>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in to Mixing Control'}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <p className="mt-5 text-center text-xs leading-5 text-slate-500">
            Development account credentials are documented in the project README.
          </p>
        </div>
      </section>
    </main>
  )
}
