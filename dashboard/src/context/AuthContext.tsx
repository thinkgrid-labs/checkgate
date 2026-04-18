import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import type { User } from '../types'

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
const KEY_SETUP = 'lg_setup_complete'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Session {
  user: User
  workspaceName: string
}

export interface LoginResult {
  ok: boolean
  error?: string
  attemptsRemaining?: number
  retryAfterSeconds?: number
}

interface AuthContextValue {
  session: Session | null
  sessionLoading: boolean
  isSetupComplete: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  logout: () => Promise<void>
  completeSetup: (
    workspaceName: string,
    name: string,
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AuthResponse {
  email: string
  name: string
  role: string
  workspace_name: string
}

function parseSession(body: AuthResponse): Session {
  const user: User = {
    id: body.email,
    email: body.email,
    name: body.name,
    role: body.role as User['role'],
    createdAt: '',
  }
  return { user, workspaceName: body.workspace_name }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [isSetupComplete, setIsSetupComplete] = useState(
    () => localStorage.getItem(KEY_SETUP) === 'true',
  )

  // On mount: restore session from the HttpOnly cookie via GET /api/auth/me.
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(res => {
        if (res.ok) return res.json() as Promise<AuthResponse>
        return null
      })
      .then(body => {
        if (body) setSession(parseSession(body))
      })
      .catch(() => {/* network error — stay logged out */})
      .finally(() => setSessionLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Checkgate-Request': 'true' },
        body: JSON.stringify({ email: email.trim(), password }),
      })

      if (res.status === 429) {
        const body = await res.json() as { error: string; retry_after_seconds: number }
        return { ok: false, error: body.error, retryAfterSeconds: body.retry_after_seconds }
      }
      if (res.status === 401) {
        const body = await res.json() as { error: string; attempts_remaining?: number }
        return { ok: false, error: body.error, attemptsRemaining: body.attempts_remaining }
      }
      if (!res.ok) {
        return { ok: false, error: `Server error (${res.status}). Please try again.` }
      }

      const body = await res.json() as AuthResponse
      setSession(parseSession(body))
      return { ok: true }
    } catch {
      return { ok: false, error: 'Could not reach the server.' }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-Checkgate-Request': 'true' },
      })
    } catch {
      // Best-effort — clear local state regardless.
    }
    setSession(null)
  }, [])

  const completeSetup = useCallback(
    async (workspaceName: string, name: string, email: string, password: string) => {
      try {
        const res = await fetch('/api/setup/complete', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-Checkgate-Request': 'true' },
          body: JSON.stringify({
            workspace_name: workspaceName.trim(),
            name: name.trim(),
            email: email.trim(),
            password,
          }),
        })

        if (res.status === 404) {
          return { ok: false, error: 'Setup already complete. Please log in.' }
        }
        if (res.status === 422) {
          return { ok: false, error: 'Password must be at least 8 characters.' }
        }
        if (!res.ok) {
          return { ok: false, error: `Server returned ${res.status}.` }
        }

        const body = await res.json() as AuthResponse
        localStorage.setItem(KEY_SETUP, 'true')
        setIsSetupComplete(true)
        setSession(parseSession(body))
        return { ok: true }
      } catch {
        return { ok: false, error: 'Could not reach the server.' }
      }
    },
    [],
  )

  return (
    <AuthContext.Provider
      value={{
        session,
        sessionLoading,
        isSetupComplete,
        login,
        logout,
        completeSetup,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
