import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { User } from '../types'

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
const KEY_SETUP = 'sk_setup_complete'
const KEY_USERS = 'sk_users'
const KEY_SESSION = 'sk_session'
const KEY_SDK = 'sidekick_sdk_key'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Session {
  user: User
  sdkKey: string
}

interface AuthContextValue {
  session: Session | null
  isSetupComplete: boolean
  login: (email: string, sdkKey: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  completeSetup: (name: string, email: string, sdkKey: string) => void
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

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY_SESSION)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(loadSession)
  const [isSetupComplete, setIsSetupComplete] = useState(
    () => localStorage.getItem(KEY_SETUP) === 'true',
  )

  const login = useCallback(async (email: string, sdkKey: string) => {
    // Validate the key against the live server
    try {
      const res = await fetch('/api/flags', {
        headers: sdkKey ? { Authorization: `Bearer ${sdkKey}` } : {},
      })
      if (res.status === 401) {
        return { ok: false, error: 'Invalid SDK key.' }
      }
      if (!res.ok && res.status !== 200) {
        return { ok: false, error: `Server returned ${res.status}.` }
      }
    } catch {
      return { ok: false, error: 'Could not reach the server.' }
    }

    const users = loadUsers()
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase())
    if (!user) {
      return { ok: false, error: 'No account found with that email.' }
    }

    const s: Session = { user, sdkKey }
    sessionStorage.setItem(KEY_SESSION, JSON.stringify(s))
    localStorage.setItem(KEY_SDK, sdkKey)
    setSession(s)
    return { ok: true }
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem(KEY_SESSION)
    setSession(null)
  }, [])

  const completeSetup = useCallback((name: string, email: string, sdkKey: string) => {
    const admin: User = {
      id: crypto.randomUUID(),
      name,
      email,
      role: 'admin',
      createdAt: new Date().toISOString(),
    }
    saveUsers([admin])
    localStorage.setItem(KEY_SETUP, 'true')
    localStorage.setItem(KEY_SDK, sdkKey)
    const s: Session = { user: admin, sdkKey }
    sessionStorage.setItem(KEY_SESSION, JSON.stringify(s))
    setIsSetupComplete(true)
    setSession(s)
  }, [])

  const getUsers = useCallback(() => loadUsers(), [])

  const addUser = useCallback((partial: Omit<User, 'id' | 'createdAt'>) => {
    const user: User = {
      ...partial,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    const users = loadUsers()
    saveUsers([...users, user])
    return user
  }, [])

  const removeUser = useCallback((id: string) => {
    saveUsers(loadUsers().filter(u => u.id !== id))
  }, [])

  return (
    <AuthContext.Provider
      value={{ session, isSetupComplete, login, logout, completeSetup, getUsers, addUser, removeUser }}
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
