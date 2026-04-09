import { Globe, LogOut, Shield, Info } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function SectionCard({ icon: Icon, title, description, children }: {
  icon: React.ElementType
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-start gap-4 px-5 py-4 border-b border-zinc-800">
        <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="w-4 h-4 text-zinc-400" />
        </div>
        <div>
          <h2 className="text-zinc-100 font-medium text-sm">{title}</h2>
          <p className="text-zinc-500 text-xs mt-0.5">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export default function Settings() {
  const { logout, session } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const apiOrigin = import.meta.env.VITE_API_URL || window.location.origin

  return (
    <div className="max-w-xl space-y-5">
      {/* Auth info */}
      <SectionCard
        icon={Shield}
        title="Authentication"
        description="Sessions use HttpOnly encrypted cookies — the SDK key is never exposed to JavaScript."
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
            <Info className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <p className="text-xs text-zinc-400 leading-relaxed">
              Your SDK key is validated server-side at login. After that, a short-lived
              encrypted cookie keeps you authenticated. The key is never stored in your browser.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-700">
              <p className="text-zinc-500 mb-0.5">Cookie flags</p>
              <p className="text-zinc-200 font-mono">HttpOnly · SameSite=Strict</p>
            </div>
            <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-700">
              <p className="text-zinc-500 mb-0.5">Session TTL</p>
              <p className="text-zinc-200 font-mono">7 days</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* API endpoint */}
      <SectionCard
        icon={Globe}
        title="API endpoint"
        description="The dashboard communicates with the Sidekick server at this origin."
      >
        <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800 border border-zinc-700">
          <code className="text-violet-400 text-sm flex-1 truncate">{apiOrigin}</code>
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Set <code className="text-zinc-500">VITE_API_URL</code> at build time to point at a different server.
        </p>
      </SectionCard>

      {/* Account */}
      <SectionCard
        icon={LogOut}
        title="Account"
        description={`Signed in as ${session?.user.email ?? '—'} · ${session?.user.role ?? ''}`}
      >
        <button
          onClick={() => void handleLogout()}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg transition-colors border border-zinc-700"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </SectionCard>
    </div>
  )
}
