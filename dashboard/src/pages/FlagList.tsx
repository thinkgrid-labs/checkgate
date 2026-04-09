import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, RotateCcw, Pencil, Trash2 } from 'lucide-react'
import { api } from '../api'
import type { Flag } from '../types'

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

export default function FlagList() {
  const [flags, setFlags] = useState<Flag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    try {
      setError(null)
      setFlags(await api.listFlags())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load flags')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function toggleEnabled(flag: Flag) {
    try {
      const updated = await api.patchFlag(flag.key, { is_enabled: !flag.is_enabled })
      setFlags(prev => prev.map(f => (f.key === flag.key ? updated : f)))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function handleDelete(key: string) {
    if (!confirm(`Delete flag "${key}"? This cannot be undone.`)) return
    try {
      await api.deleteFlag(key)
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
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none transition-colors group-focus-within:text-emerald-500" />
          <input
            type="search"
            placeholder="Search flags…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-white border border-gray-100 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 shadow-premium transition-all"
          />
        </div>
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
                <p className="text-gray-400 text-sm">No flags yet.</p>
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
          </div>
        )}
      </div>
    </div>
  )
}
