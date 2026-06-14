import { useState } from 'react'
import { Globe, LogOut, Shield, Info, Code2, Copy, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function SectionCard({ icon: Icon, title, description, children }: {
  icon: React.ElementType
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="premium-card shadow-premium-lg border-none">
      <div className="flex items-start gap-5 px-6 py-5 border-b border-gray-50 bg-white">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-gray-900 font-display font-bold text-sm tracking-tight">{title}</h2>
          <p className="text-gray-400 text-xs mt-0.5">{description}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Code snippet block
// ---------------------------------------------------------------------------

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative">
      <pre className="bg-gray-950 text-gray-100 text-xs leading-relaxed p-4 rounded-xl overflow-x-auto font-mono">
        {code}
      </pre>
      <button
        onClick={() => {
          navigator.clipboard.writeText(code).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }}
        className="absolute top-2.5 right-2.5 p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
        title="Copy"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function Settings() {
  const { logout, session } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const apiOrigin = import.meta.env.VITE_API_URL || window.location.origin

  const jsSnippet = `// npm install @checkgate/web
import { createClient } from '@checkgate/web'

const client = createClient({
  sdkKey: 'sk_live_…',
  serverUrl: '${apiOrigin}',
})

await client.connect()

const darkMode = client.getBool('dark_mode', false)
console.log('dark_mode →', darkMode)`

  const nodeSnippet = `// npm install @checkgate/node
import Checkgate from '@checkgate/node'

const client = new Checkgate({
  sdkKey: process.env.CHECKGATE_SDK_KEY,
  serverUrl: '${apiOrigin}',
})

await client.connect()

const enabled = client.getBool('feature_x', false, { userId: req.user.id })`

  return (
    <div className="max-w-2xl space-y-5">

      {/* SDK quick-start */}
      <SectionCard
        icon={Code2}
        title="SDK quick-start"
        description="Copy a snippet to connect your app to this Checkgate instance."
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Browser / Node (ESM)
            </p>
            <CodeBlock code={jsSnippet} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Node.js (server-side evaluation)
            </p>
            <CodeBlock code={nodeSnippet} />
          </div>
          <p className="text-xs text-gray-400">
            Replace <code className="text-gray-600">sk_live_…</code> with an SDK key from the{' '}
            <a href="/settings" className="text-emerald-600 hover:underline">Settings → SDK Keys</a> page
            (or the key shown during initial setup).
          </p>
        </div>
      </SectionCard>

      {/* Auth info */}
      <SectionCard
        icon={Shield}
        title="Authentication"
        description="Sessions use HttpOnly encrypted cookies — the SDK key is never exposed to JavaScript."
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <Info className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs text-gray-600 leading-relaxed">
              Your SDK key is validated server-side at login. After that, a short-lived
              encrypted cookie keeps you authenticated. The key is never stored in your browser.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-gray-500 mb-0.5">Cookie flags</p>
              <p className="text-gray-800 font-mono">HttpOnly · SameSite=Strict</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-gray-500 mb-0.5">Session TTL</p>
              <p className="text-gray-800 font-mono">7 days</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* API endpoint */}
      <SectionCard
        icon={Globe}
        title="API endpoint"
        description="The dashboard communicates with the Checkgate server at this origin."
      >
        <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <code className="text-emerald-600 text-sm flex-1 truncate">{apiOrigin}</code>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Set <code className="text-gray-600">VITE_API_URL</code> at build time to point at a different server.
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
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors border border-gray-200"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </SectionCard>
    </div>
  )
}
