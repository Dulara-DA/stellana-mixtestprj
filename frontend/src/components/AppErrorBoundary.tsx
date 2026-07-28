import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Stellana Mixing Control rendering error', error, info)
  }

  private reload = () => {
    window.location.reload()
  }

  private returnToLogin = () => {
    localStorage.removeItem('stellana_token')
    localStorage.removeItem('stellana_user')
    window.location.assign('/login')
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-8">
        <section className="w-full max-w-xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-panel">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-100 text-red-700">
            <AlertTriangle size={28} />
          </div>
          <h1 className="mt-5 text-2xl font-black text-ink">The dashboard could not be displayed</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Restart the backend after system updates, then reload this page. Your production records have not been deleted.
          </p>
          <div className="mt-7 flex justify-center gap-3">
            <button type="button" className="btn-primary" onClick={this.reload}>
              <RefreshCw size={17} /> Reload page
            </button>
            <button type="button" className="btn-secondary" onClick={this.returnToLogin}>
              <ShieldAlert size={17} /> Return to sign in
            </button>
          </div>
        </section>
      </main>
    )
  }
}
