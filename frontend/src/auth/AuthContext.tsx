import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, SESSION_EXPIRED_EVENT } from '../lib/api'
import type { User } from '../types'

interface AuthContextValue {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function storedUser(): User | null {
  const value = localStorage.getItem('stellana_user')
  if (!value) return null
  try {
    return JSON.parse(value) as User
  } catch {
    localStorage.removeItem('stellana_user')
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(storedUser)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('stellana_token'))

  useEffect(() => {
    const clearExpiredSession = () => {
      setToken(null)
      setUser(null)
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, clearExpiredSession)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, clearExpiredSession)
  }, [])

  const login = async (email: string, password: string) => {
    const response = await api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    localStorage.setItem('stellana_token', response.token)
    localStorage.setItem('stellana_user', JSON.stringify(response.user))
    setToken(response.token)
    setUser(response.user)
    return response.user
  }

  const logout = () => {
    localStorage.removeItem('stellana_token')
    localStorage.removeItem('stellana_user')
    setToken(null)
    setUser(null)
  }

  const value = useMemo(() => ({ user, token, login, logout }), [user, token])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
