import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ToggleLeft,
  Users,
  Settings,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/flags', icon: ToggleLeft, label: 'Feature Flags', end: false },
  { to: '/users', icon: Users, label: 'Users', end: false },
  { to: '/settings', icon: Settings, label: 'Settings', end: false },
]

export default function Sidebar() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-64 shrink-0 flex flex-col h-screen bg-white border-r border-gray-100 shadow-premium">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 h-16 mb-2">
        <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-50 overflow-hidden">
          <img
            src="/checkgate_logo.png"
            alt=""
            className="h-8 w-8 object-contain"
          />
        </div>
        <span className="text-gray-900 font-display font-bold text-xl tracking-tight">Checkgate</span>
      </div>

      {/* Nav */}
    <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
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
