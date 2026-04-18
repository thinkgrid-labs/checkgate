import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useProject } from './ProjectContext'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Environment {
  id: string
  name: string
  slug: string
  color: string
  is_default: boolean
  created_at: string
}

interface EnvironmentContextValue {
  environments: Environment[]
  activeEnv: Environment | null
  loading: boolean
  setActiveEnv: (env: Environment) => void
  reload: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const KEY_ACTIVE_ENV = 'lg_active_env_id'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null)

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const { activeProject } = useProject()
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [activeEnv, setActiveEnvState] = useState<Environment | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!activeProject) return
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/environments`, {
        credentials: 'same-origin',
        headers: { 'X-Checkgate-Request': '1' },
      })
      if (!res.ok) return
      const envs = await res.json() as Environment[]
      setEnvironments(envs)

      const savedId = localStorage.getItem(KEY_ACTIVE_ENV)
      const saved = envs.find(e => e.id === savedId)
      const defaultEnv = envs.find(e => e.is_default) ?? envs[0] ?? null
      setActiveEnvState(saved ?? defaultEnv)
    } finally {
      setLoading(false)
    }
  }, [activeProject])

  // Reload when active project changes.
  useEffect(() => {
    setLoading(true)
    setEnvironments([])
    setActiveEnvState(null)
    void reload()
  }, [reload])

  function setActiveEnv(env: Environment) {
    setActiveEnvState(env)
    localStorage.setItem(KEY_ACTIVE_ENV, env.id)
  }

  return (
    <EnvironmentContext.Provider value={{ environments, activeEnv, loading, setActiveEnv, reload }}>
      {children}
    </EnvironmentContext.Provider>
  )
}

export function useEnvironment() {
  const ctx = useContext(EnvironmentContext)
  if (!ctx) throw new Error('useEnvironment must be used inside EnvironmentProvider')
  return ctx
}
