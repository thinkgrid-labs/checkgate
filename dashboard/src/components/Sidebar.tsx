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
  Tags,
  History,
  Webhook,
  Wifi,
  CalendarClock,
  GitPullRequest,
  PieChart,
  FlaskConical,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useEnvironment, type Environment } from '../context/EnvironmentContext'
import { useProject } from '../context/ProjectContext'
import type { Project } from '../types'

const NAV_ALL = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true, adminOnly: false },
  { to: '/flags', icon: ToggleLeft, label: 'Feature Flags', end: false, adminOnly: false },
  { to: '/segments', icon: Tags, label: 'Segments', end: false, adminOnly: false },
  { to: '/change-requests', icon: GitPullRequest, label: 'Change Requests', end: false, adminOnly: false },
  { to: '/schedule', icon: CalendarClock, label: 'Scheduled', end: false, adminOnly: false },
  { to: '/impressions', icon: Activity, label: 'Impressions', end: false, adminOnly: false },
  { to: '/exposure', icon: PieChart, label: 'Exposure', end: false, adminOnly: false },
  { to: '/experiments', icon: FlaskConical, label: 'Experiments', end: false, adminOnly: false },
  { to: '/audit', icon: History, label: 'Audit Log', end: false, adminOnly: false },
  { to: '/sdk-health', icon: Wifi, label: 'SDK Health', end: false, adminOnly: false },
  { to: '/webhooks', icon: Webhook, label: 'Webhooks', end: false, adminOnly: true },
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

const KEY_SIDEBAR_COLLAPSED = 'lg_sidebar_collapsed'

export default function Sidebar() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const isAdmin = session?.user.role === 'admin'
  const NAV = NAV_ALL.filter(item => !item.adminOnly || isAdmin)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(KEY_SIDEBAR_COLLAPSED) === 'true')

  function toggleCollapsed() {
    setCollapsed(c => {
      localStorage.setItem(KEY_SIDEBAR_COLLAPSED, String(!c))
      return !c
    })
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside className={`${collapsed ? 'w-[76px]' : 'w-64'} shrink-0 flex flex-col h-screen bg-white border-r border-gray-100 shadow-premium transition-[width] duration-200`}>
      {/* Logo + workspace name */}
      <div className={`flex items-center h-16 mb-2 ${collapsed ? 'justify-center px-2' : 'gap-3 px-6'}`}>
        <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-50 overflow-hidden shrink-0">
          <img src="/checkgate_logo.png" alt="" className="h-8 w-8 object-contain" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <span className="text-gray-900 font-display font-bold text-xl tracking-tight">Checkgate</span>
            {session?.workspaceName && (
              <p className="text-gray-400 text-[10px] font-medium truncate leading-none mt-0.5">{session.workspaceName}</p>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Project switcher */}
          <ProjectSwitcher />

          {/* Environment switcher */}
          <EnvSwitcher />
        </>
      )}

      {/* Nav */}
      <nav className={`flex-1 py-2 space-y-1 overflow-y-auto ${collapsed ? 'px-3' : 'px-4'}`}>
        {NAV.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `group flex items-center rounded-xl text-sm font-medium transition-all duration-200 ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
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
                {!collapsed && <span className="flex-1">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className={`px-4 pb-2 ${collapsed ? 'flex justify-center px-3' : ''}`}>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex items-center gap-3 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all duration-200 ${
            collapsed ? 'justify-center w-10' : 'w-full px-3'
          }`}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4 shrink-0" /> : <PanelLeftClose className="w-4 h-4 shrink-0" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>

      {/* User section */}
      <div className={`py-4 border-t border-gray-100 bg-gray-50/50 ${collapsed ? 'px-3' : 'px-4'}`}>
        <div className={`flex items-center mb-2 ${collapsed ? 'justify-center' : 'gap-3 px-2 py-2'}`}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-md shadow-emerald-200 flex items-center justify-center shrink-0" title={collapsed ? session?.user.name : undefined}>
            <span className="text-white text-sm font-bold">
              {session?.user.name.charAt(0).toUpperCase() ?? '?'}
            </span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-gray-900 text-xs font-bold truncate">{session?.user.name}</p>
              <p className="text-gray-500 text-[10px] tracking-wider uppercase font-semibold">{session?.user.role}</p>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sign out' : undefined}
          className={`flex items-center rounded-xl text-sm text-gray-500 hover:text-rose-600 hover:bg-rose-50 transition-all duration-200 group ${
            collapsed ? 'justify-center w-10 h-10 mx-auto' : 'w-full gap-3 px-3 py-2.5'
          }`}
        >
          <LogOut className="w-4 h-4 transition-transform group-hover:translate-x-0.5 shrink-0" />
          {!collapsed && <span className="font-semibold">Sign out</span>}
        </button>
      </div>
    </aside>
  )
}
