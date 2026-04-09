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
// Only the setup-complete flag is stored locally — it's a client-side UX hint
// to avoid showing the setup wizard after first login. The authoritative state
// is in the server's `settings` table; the server will reject a second setup.
const KEY_SETUP = 'lg_setup_complete'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Session {
  user: User
}

interface AuthContextValue {
  /** `null` while loading or logged out. */
  session: Session | null
  /** `true` once initial `/api/auth/me` check completes (avoids redirect flicker). */
  sessionLoading: boolean
  isSetupComplete: boolean
  login: (
    email: string,
    sdkKey: string,
  ) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  completeSetup: (
    name: string,
    email: string,
    sdkKey: string,
  ) => Promise<{ ok: boolean; error?: string }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map `/api/auth/me` (or login) response → Session */
function parseSession(body: { email: string; name: string; role: string }): Session {
  const user: User = {
    id: body.email,
    email: body.email,
    name: body.name,
    role: body.role as User['role'],
    createdAt: '',
  }
  return { user }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  // Session lives in React state ONLY — never written to localStorage.
  // The HttpOnly cookie is managed entirely by the browser/server.
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [isSetupComplete, setIsSetupComplete] = useState(
    () => localStorage.getItem(KEY_SETUP) === 'true',
  )

  // On mount: restore session from the HttpOnly cookie via GET /api/auth/me.
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(res => {
        if (res.ok) return res.json() as Promise<{ email: string; name: string; role: string }>
        return null
      })
      .then(body => {
        if (body) setSession(parseSession(body))
      })
      .catch(() => {/* network error — stay logged out */})
      .finally(() => setSessionLoading(false))
  }, [])

  const login = useCallback(async (email: string, sdkKey: string) => {
    // Name and role are looked up server-side from the users table —
    // the client only sends email + SDK key.
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Checkgate-Request': 'true' },
        body: JSON.stringify({ email: email.trim(), sdk_key: sdkKey.trim() }),
      })

      if (res.status === 401) {
        return { ok: false, error: 'Invalid SDK key or email not found.' }
      }
      if (!res.ok) {
        return { ok: false, error: `Server returned ${res.status}.` }
      }

      const body = await res.json() as { email: string; name: string; role: string }
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
    async (name: string, email: string, sdkKey: string) => {
      // POST to the dedicated setup endpoint which atomically:
      //   1. Validates the SDK key
      //   2. Creates the admin user in the DB
      //   3. Marks setup_complete = true
      //   4. Issues the session cookie
      //
      // Local state is only updated AFTER the server confirms success, so a
      // network failure never leaves the client in an inconsistent state.
      try {
        const res = await fetch('/api/setup/complete', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-Checkgate-Request': 'true' },
          body: JSON.stringify({ name: name.trim(), email: email.trim(), sdk_key: sdkKey }),
        })

        if (res.status === 401) {
          return { ok: false, error: 'SDK key rejected by server.' }
        }
        if (res.status === 404) {
          return { ok: false, error: 'Setup already complete. Please log in.' }
        }
        if (!res.ok) {
          return { ok: false, error: `Server returned ${res.status}.` }
        }

        const body = await res.json() as { email: string; name: string; role: string }

        // Server confirmed — now update local state.
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
