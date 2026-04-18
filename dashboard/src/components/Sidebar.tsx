import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ToggleLeft,
  Users,
  Settings,
  LogOut,
  Globe,
  ChevronDown,
  Activity,
  FolderKanban,
  Plus,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useEnvironment, type Environment } from '../context/EnvironmentContext'
import { useProject } from '../context/ProjectContext'
import type { Project } from '../types'

const NAV_ALL = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true, adminOnly: false },
  { to: '/flags', icon: ToggleLeft, label: 'Feature Flags', end: false, adminOnly: false },
  { to: '/impressions', icon: Activity, label: 'Impressions', end: false, adminOnly: false },
  { to: '/environments', icon: Globe, label: 'Environments', end: false, adminOnly: true },
  { to: '/projects', icon: FolderKanban, label: 'Projects', end: false, adminOnly: true },
  { to: '/users', icon: Users, label: 'Users', end: false, adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Settings', end: false, adminOnly: true },
]

// ---------------------------------------------------------------------------
// Project switcher dropdown
// ---------------------------------------------------------------------------

function ProjectSwitcher() {
  const { projects, activeProject, setActiveProject } = useProject()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isAdmin = session?.user.role === 'admin'

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!activeProject) return null

  function select(p: Project) {
    setActiveProject(p)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative px-4 mb-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-xl transition-colors text-left"
      >
        <FolderKanban className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="flex-1 text-sm font-bold text-emerald-800 truncate">{activeProject.name}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-emerald-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-4 right-4 top-full mt-1 z-50 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => select(p)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left hover:bg-gray-50 ${
                p.id === activeProject.id ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-700'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5 shrink-0 text-gray-400" />
              <span className="flex-1 truncate">{p.name}</span>
            </button>
          ))}
          {isAdmin && (
            <button
              onClick={() => { setOpen(false); navigate('/projects') }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-emerald-600 hover:bg-emerald-50 border-t border-gray-100 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="font-semibold">New project</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Environment switcher dropdown
// ---------------------------------------------------------------------------

function EnvSwitcher() {
  const { environments, activeEnv, setActiveEnv } = useEnvironment()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!activeEnv) return null

  function select(env: Environment) {
    setActiveEnv(env)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative px-4 mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-xl transition-colors text-left"
      >
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: activeEnv.color }} />
        <span className="flex-1 text-sm font-semibold text-gray-700 truncate">{activeEnv.name}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-4 right-4 top-full mt-1 z-50 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden">
          {environments.map(env => (
            <button
              key={env.id}
              onClick={() => select(env)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left hover:bg-gray-50 ${
                env.id === activeEnv.id ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-700'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: env.color }} />
              <span className="flex-1 truncate">{env.name}</span>
              {env.is_default && (
                <span className="text-[9px] text-gray-400 uppercase tracking-wide font-bold">default</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export default function Sidebar() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const isAdmin = session?.user.role === 'admin'
  const NAV = NAV_ALL.filter(item => !item.adminOnly || isAdmin)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-64 shrink-0 flex flex-col h-screen bg-white border-r border-gray-100 shadow-premium">
      {/* Logo + workspace name */}
      <div className="flex items-center gap-3 px-6 h-16 mb-2">
        <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-50 overflow-hidden">
          <img src="/checkgate_logo.png" alt="" className="h-8 w-8 object-contain" />
        </div>
        <div className="min-w-0">
          <span className="text-gray-900 font-display font-bold text-xl tracking-tight">Checkgate</span>
          {session?.workspaceName && (
            <p className="text-gray-400 text-[10px] font-medium truncate leading-none mt-0.5">{session.workspaceName}</p>
          )}
        </div>
      </div>

      {/* Project switcher */}
      <ProjectSwitcher />

      {/* Environment switcher */}
      <EnvSwitcher />

      {/* Nav */}
      <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100/50'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`p-1 rounded-lg transition-colors ${isActive ? 'bg-white shadow-sm' : 'group-hover:bg-white/50'}`}>
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                </div>
                <span className="flex-1">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="px-4 py-4 border-t border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-3 px-2 py-2 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-md shadow-emerald-200 flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">
              {session?.user.name.charAt(0).toUpperCase() ?? '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-900 text-xs font-bold truncate">{session?.user.name}</p>
            <p className="text-gray-500 text-[10px] tracking-wider uppercase font-semibold">{session?.user.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-rose-600 hover:bg-rose-50 transition-all duration-200 group"
        >
          <LogOut className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          <span className="font-semibold">Sign out</span>
        </button>
      </div>
    </aside>
  )
}
