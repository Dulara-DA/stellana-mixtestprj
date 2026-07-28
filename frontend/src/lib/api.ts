const API_URL = import.meta.env.VITE_API_URL ?? ''
export const SESSION_EXPIRED_EVENT = 'stellana-session-expired'
export const SESSION_MESSAGE_KEY = 'stellana_session_message'

export class ApiError extends Error {
  status: number
  fieldErrors: Record<string, string>

  constructor(message: string, status: number, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('stellana_token')
  const hadStoredSession = Boolean(token || localStorage.getItem('stellana_user'))
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    if (response.status === 401) {
      localStorage.removeItem('stellana_token')
      localStorage.removeItem('stellana_user')
      if (hadStoredSession && path !== '/api/auth/login') {
        sessionStorage.setItem(
          SESSION_MESSAGE_KEY,
          payload?.message ?? 'Your session has expired. Please sign in again.',
        )
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
      }
    }
    throw new ApiError(
      payload?.message ?? `Request failed with status ${response.status}`,
      response.status,
      payload?.fieldErrors ?? {},
    )
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export async function downloadFile(path: string, fallbackFilename: string): Promise<string> {
  const token = localStorage.getItem('stellana_token')
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_URL}${path}`, { headers })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    if (response.status === 401) {
      localStorage.removeItem('stellana_token')
      localStorage.removeItem('stellana_user')
      sessionStorage.setItem(
        SESSION_MESSAGE_KEY,
        payload?.message ?? 'Your session has expired. Please sign in again.',
      )
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }
    throw new ApiError(
      payload?.message ?? `Download failed with status ${response.status}`,
      response.status,
      payload?.fieldErrors ?? {},
    )
  }
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const encodedFilename = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plainFilename = disposition.match(/filename="?([^";]+)"?/i)?.[1]
  const filename = encodedFilename
    ? decodeURIComponent(encodedFilename)
    : plainFilename ?? fallbackFilename
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  return filename
}

export function displayError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

export const formatDateTime = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en-LK', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'

export const formatElapsed = (start?: string, end?: string, now = Date.now()) => {
  if (!start) return '—'
  const startTime = new Date(start).getTime()
  const endTime = end ? new Date(end).getTime() : now
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return '—'

  const totalSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

export const humanize = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
