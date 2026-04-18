import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Project } from '../types'
import { useAuth } from './AuthContext'

const KEY_ACTIVE_PROJECT = 'lg_active_project'

interface ProjectContextValue {
  projects: Project[]
  activeProject: Project | null
  setActiveProject: (p: Project) => void
  loading: boolean
  reload: () => Promise<void>
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProject, setActiveProjectState] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!session) return
    try {
      const res = await fetch('/api/projects', {
        credentials: 'same-origin',
        headers: { 'X-Checkgate-Request': '1' },
      })
      if (!res.ok) return
      const data = await res.json() as Project[]
      setProjects(data)

      const savedId = localStorage.getItem(KEY_ACTIVE_PROJECT)
      const saved = data.find(p => p.id === savedId)
      const first = data[0] ?? null
      setActiveProjectState(saved ?? first)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    void reload()
  }, [reload])

  function setActiveProject(p: Project) {
    setActiveProjectState(p)
    localStorage.setItem(KEY_ACTIVE_PROJECT, p.id)
  }

  return (
    <ProjectContext.Provider value={{ projects, activeProject, setActiveProject, loading, reload }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used inside ProjectProvider')
  return ctx
}
