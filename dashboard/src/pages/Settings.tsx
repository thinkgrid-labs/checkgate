import { useState, useEffect, useCallback } from 'react'
import { Globe, LogOut, Shield, Info, Key, Plus, Trash2, Copy, Check, AlertCircle, X } from 'lucide-react'
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
// SDK Keys
// ---------------------------------------------------------------------------

interface SdkKeyInfo {
  id: number
  name: string
  prefix: string
  created_at: string
}

interface NewKeyResponse {
  id: number
  name: string
  key: string
  prefix: string
  created_at: string
}

function SdkKeysSection() {
  const [keys, setKeys] = useState<SdkKeyInfo[]>([])
  const [loadError, setLoadError] = useState('')
  const [newKeyName, setNewKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [revealedKey, setRevealedKey] = useState<NewKeyResponse | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [revoking, setRevoking] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const res = await fetch('/api/keys', {
        credentials: 'same-origin',
        headers: { 'X-Checkgate-Request': '1' },
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setKeys(await res.json() as SdkKeyInfo[])
    } catch {
      setLoadError('Failed to load SDK keys.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleCreate() {
    if (!newKeyName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Checkgate-Request': '1',
        },
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const created = await res.json() as NewKeyResponse
      setRevealedKey(created)
      setNewKeyName('')
      setShowCreateForm(false)
      await load()
    } catch {
      // error handled inline
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: number) {
    if (!confirm('Revoke this key? Any SDK clients using it will stop working immediately.')) return
    setRevoking(id)
    try {
      await fetch(`/api/keys/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-Checkgate-Request': '1' },
      })
      await load()
    } finally {
      setRevoking(null)
    }
  }

  async function handleCopy(key: string, id: number) {
    await navigator.clipboard.writeText(key)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <SectionCard
      icon={Key}
      title="SDK Keys"
      description="Keys authenticate SDK clients and dashboard logins. Each key is shown only once when created."
    >
      {loadError && (
        <p className="text-rose-400 text-sm mb-4">{loadError}</p>
      )}

      {/* Newly created key — shown once */}
      {revealedKey && (
        <div className="mb-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-emerald-700 text-xs font-medium flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Save this key now — it won't be shown again
            </p>
            <button onClick={() => setRevealedKey(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded bg-white border border-gray-200">
            <code className="flex-1 text-emerald-600 text-xs font-mono break-all">{revealedKey.key}</code>
            <button
              onClick={() => void handleCopy(revealedKey.key, revealedKey.id)}
              className="shrink-0 p-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors"
            >
              {copiedId === revealedKey.id
                ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Keys list */}
      <div className="space-y-2 mb-4">
        {keys.map(k => (
          <div key={k.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div className="min-w-0">
              <p className="text-gray-900 text-sm font-medium truncate">{k.name}</p>
              <p className="text-gray-500 text-xs font-mono">{k.prefix}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <p className="text-gray-400 text-xs hidden sm:block">
                {new Date(k.created_at).toLocaleDateString()}
              </p>
              <button
                onClick={() => void handleRevoke(k.id)}
                disabled={revoking === k.id || keys.length <= 1}
                title={keys.length <= 1 ? 'Cannot revoke the last key' : 'Revoke key'}
                className="p-1.5 rounded bg-gray-100 hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {revoking === k.id
                  ? <span className="inline-block w-3.5 h-3.5 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        ))}
        {keys.length === 0 && !loadError && (
          <p className="text-gray-400 text-sm text-center py-4">No keys yet.</p>
        )}
      </div>

      {/* Create form */}
      {showCreateForm ? (
        <div className="flex gap-2">
          <input
            autoFocus
            type="text"
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') setShowCreateForm(false) }}
            placeholder="Key name (e.g. Production)"
            className="flex-1 bg-white border border-gray-100 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/30 transition-all shadow-premium"
          />
          <button
            onClick={() => void handleCreate()}
            disabled={creating || !newKeyName.trim()}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-emerald-200 hover:shadow-emerald-300 hover:-translate-y-0.5"
          >
            {creating ? '…' : 'Create'}
          </button>
          <button
            onClick={() => { setShowCreateForm(false); setNewKeyName('') }}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> Generate new key
        </button>
      )}
    </SectionCard>
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

  return (
    <div className="max-w-xl space-y-5">
      {/* SDK Keys */}
      <SdkKeysSection />

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
