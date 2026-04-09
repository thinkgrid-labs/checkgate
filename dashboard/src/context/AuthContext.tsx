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
// Storage keys — only NON-SENSITIVE display data lives here.
// The SDK key and session token are NEVER stored in the browser.
// ---------------------------------------------------------------------------
const KEY_SETUP = 'lg_setup_complete'
const KEY_USERS = 'lg_users'

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
  getUsers: () => User[]
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => User
  removeUser: (id: string) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function loadUsers(): User[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_USERS) ?? '[]') as User[]
  } catch {
    return []
  }
}

function saveUsers(users: User[]) {
  localStorage.setItem(KEY_USERS, JSON.stringify(users))
}

/** Map `/api/auth/me` response → Session */
function parseSession(body: { email: string; name: string; role: string }): Session {
  const user: User = {
    id: body.email, // stable identifier — email is unique per user
    email: body.email,
    name: body.name,
    role: body.role as User['role'],
    createdAt: '', // not persisted server-side
  }
  return { user }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  // Session lives in React state ONLY — never written to localStorage/sessionStorage.
  // The HttpOnly cookie is managed entirely by the browser/server.
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [isSetupComplete, setIsSetupComplete] = useState(
    () => localStorage.getItem(KEY_SETUP) === 'true',
  )

  // On mount: check if there's a live session cookie via GET /api/auth/me.
  // This restores the session after a page refresh without re-entering credentials.
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
    // Look up user profile from browser-local store (name + role are display data).
    const users = loadUsers()
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase())
    if (!user) {
      return { ok: false, error: 'No account found with that email.' }
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          sdk_key: sdkKey,
          name: user.name,
          role: user.role,
        }),
      })

      if (res.status === 401) {
        return { ok: false, error: 'Invalid SDK key.' }
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
      })
    } catch {
      // Best-effort — clear local state regardless.
    }
    setSession(null)
  }, [])

  const completeSetup = useCallback(
    async (name: string, email: string, sdkKey: string) => {
      // Create the first admin user in local storage (display data, not a secret).
      const admin: User = {
        id: email,
        name,
        email,
        role: 'admin',
        createdAt: new Date().toISOString(),
      }
      saveUsers([admin])
      localStorage.setItem(KEY_SETUP, 'true')
      setIsSetupComplete(true)

      // Issue the session cookie server-side.
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, sdk_key: sdkKey, name, role: 'admin' }),
        })

        if (res.status === 401) {
          return { ok: false, error: 'SDK key rejected by server.' }
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
    },
    [],
  )

  const getUsers = useCallback(() => loadUsers(), [])

  const addUser = useCallback((partial: Omit<User, 'id' | 'createdAt'>) => {
    const user: User = {
      ...partial,
      id: partial.email,
      createdAt: new Date().toISOString(),
    }
    saveUsers([...loadUsers(), user])
    return user
  }, [])

  const removeUser = useCallback((id: string) => {
    saveUsers(loadUsers().filter(u => u.id !== id))
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        sessionLoading,
        isSetupComplete,
        login,
        logout,
        completeSetup,
        getUsers,
        addUser,
        removeUser,
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
