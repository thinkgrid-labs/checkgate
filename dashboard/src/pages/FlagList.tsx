import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, RotateCcw, Pencil, Trash2, ArrowUpRight } from 'lucide-react'
import { api } from '../api'
import type { Flag, FlagType } from '../types'
import { useEnvironment } from '../context/EnvironmentContext'

const TYPE_BADGE: Partial<Record<FlagType, { label: string; cls: string }>> = {
  string: { label: 'STR', cls: 'bg-blue-50 text-blue-700 ring-blue-100' },
  integer: { label: 'INT', cls: 'bg-violet-50 text-violet-700 ring-violet-100' },
  json: { label: 'JSON', cls: 'bg-amber-50 text-amber-700 ring-amber-100' },
}

function TypeBadge({ flagType }: { flagType?: FlagType }) {
  if (!flagType || flagType === 'boolean') return null
  const badge = TYPE_BADGE[flagType]
  if (!badge) return null
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ring-1 ml-2 ${badge.cls}`}>
      {badge.label}
    </span>
  )
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/20 ${
        enabled ? 'bg-emerald-600' : 'bg-gray-200'
      }`}
      aria-label={enabled ? 'Disable flag' : 'Enable flag'}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Promote modal
// ---------------------------------------------------------------------------

function PromoteModal({ flag, onClose }: { flag: Flag; onClose: () => void }) {
  const { environments, activeEnv } = useEnvironment()
  const [targetId, setTargetId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const targets = environments.filter(e => e.id !== activeEnv?.id)

  async function handlePromote() {
    if (!activeEnv || !targetId) return
    setLoading(true)
    setError('')
    try {
      await api.promoteFlag(activeEnv.id, flag.key, targetId)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Promote failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-sm mx-4">
        {done ? (
          <div className="text-center py-4">
            <p className="text-emerald-600 font-bold text-lg mb-1">Promoted!</p>
            <p className="text-gray-500 text-sm mb-4">
              <code className="font-mono text-emerald-600">{flag.key}</code> was copied to{' '}
              {environments.find(e => e.id === targetId)?.name}.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-xl text-sm hover:bg-emerald-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h3 className="font-bold text-gray-900 mb-1">Promote flag</h3>
            <p className="text-gray-500 text-sm mb-4">
              Copy <code className="font-mono text-emerald-600">{flag.key}</code> configuration to another environment.
            </p>

            {error && (
              <p className="text-rose-500 text-xs mb-3">{error}</p>
            )}

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Target environment</label>
              <select
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">Select environment…</option>
                {targets.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => void handlePromote()}
                disabled={!targetId || loading}
                className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all"
              >
                {loading ? 'Promoting…' : 'Promote'}
              </button>
              <button
                onClick={onClose}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function FlagList() {
  const { activeEnv } = useEnvironment()
  const [flags, setFlags] = useState<Flag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [promotingFlag, setPromotingFlag] = useState<Flag | null>(null)

  const load = useCallback(async () => {
    if (!activeEnv) return
    try {
      setError(null)
      setFlags(await api.listFlags(activeEnv.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load flags')
    } finally {
      setLoading(false)
    }
  }, [activeEnv])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  async function toggleEnabled(flag: Flag) {
    if (!activeEnv) return
    try {
      const updated = await api.patchFlag(activeEnv.id, flag.key, { is_enabled: !flag.is_enabled })
      setFlags(prev => prev.map(f => (f.key === flag.key ? updated : f)))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function handleDelete(key: string) {
    if (!activeEnv) return
    if (!confirm(`Delete flag "${key}" from ${activeEnv.name}? This cannot be undone.`)) return
    try {
      await api.deleteFlag(activeEnv.id, key)
      setFlags(prev => prev.filter(f => f.key !== key))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const filtered = query.trim()
    ? flags.filter(f =>
        f.key.toLowerCase().includes(query.toLowerCase()) ||
        f.description?.toLowerCase().includes(query.toLowerCase()),
      )
    : flags

  return (
    <div className="w-full space-y-4">
      {promotingFlag && (
        <PromoteModal flag={promotingFlag} onClose={() => setPromotingFlag(null)} />
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search flags…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-white border border-gray-100 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 shadow-premium transition-all"
          />
        </div>

        {/* Active env badge */}
        {activeEnv && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-100 rounded-xl text-xs font-semibold text-gray-600 shadow-sm">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: activeEnv.color }} />
            {activeEnv.name}
          </div>
        )}

        <div className="flex-1" />
        {error && (
          <button
            onClick={() => { setLoading(true); void load() }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry
          </button>
        )}
        <Link
          to="/flags/new"
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-emerald-200 hover:shadow-emerald-300 hover:-translate-y-0.5"
        >
          <Plus className="w-4 h-4" /> New flag
        </Link>
      </div>

      {/* Table card */}
      <div className="premium-card shadow-premium-lg border-none bg-white">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
        ) : error ? (
          <div className="flex items-center justify-center h-40 text-red-500 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            {query ? (
              <p className="text-gray-400 text-sm">No flags match "<span className="text-gray-700">{query}</span>"</p>
            ) : (
              <>
                <p className="text-gray-400 text-sm">No flags in {activeEnv?.name ?? 'this environment'} yet.</p>
                <Link
                  to="/flags/new"
                  className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Create your first flag
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/50">
                  <th className="text-left px-8 py-4 text-gray-400 font-bold text-[10px] uppercase tracking-widest">Key</th>
                  <th className="text-left px-8 py-4 text-gray-400 font-bold text-[10px] uppercase tracking-widest hidden md:table-cell">Description</th>
                  <th className="text-left px-8 py-4 text-gray-400 font-bold text-[10px] uppercase tracking-widest">Rollout</th>
                  <th className="text-left px-8 py-4 text-gray-400 font-bold text-[10px] uppercase tracking-widest hidden sm:table-cell">Rules</th>
                  <th className="text-left px-8 py-4 text-gray-400 font-bold text-[10px] uppercase tracking-widest">Status</th>
                  <th className="px-8 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50/50">
                {filtered.map(flag => (
                  <tr key={flag.key} className="group hover:bg-emerald-50/20 transition-all">
                    <td className="px-8 py-5">
                      <span className="font-mono text-emerald-600 font-semibold text-sm">{flag.key}</span>
                      <TypeBadge flagType={flag.flag_type} />
                    </td>
                    <td className="px-8 py-5 hidden md:table-cell">
                      <span className="text-gray-500 truncate max-w-xs block text-xs">
                        {flag.description ?? <span className="text-gray-300 italic">—</span>}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-gray-900 font-medium font-mono text-xs">
                      {flag.rollout_percentage != null ? `${flag.rollout_percentage}%` : '100%'}
                    </td>
                    <td className="px-8 py-5 hidden sm:table-cell">
                      {flag.rules.length > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                          {flag.rules.length} rule{flag.rules.length !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-8 py-5">
                      <Toggle enabled={flag.is_enabled} onToggle={() => void toggleEnabled(flag)} />
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => setPromotingFlag(flag)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          aria-label="Promote flag"
                          title="Promote to another environment"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                        <Link
                          to={`/flags/${encodeURIComponent(flag.key)}/edit`}
                          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                          aria-label="Edit flag"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={() => void handleDelete(flag.key)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          aria-label="Delete flag"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400 bg-gray-50">
            {filtered.length} flag{filtered.length !== 1 ? 's' : ''}
            {query && ` matching "${query}"`}
            {activeEnv && ` in ${activeEnv.name}`}
          </div>
        )}
      </div>
    </div>
  )
}
