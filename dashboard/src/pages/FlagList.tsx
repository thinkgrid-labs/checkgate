import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, RotateCcw, Pencil, Trash2 } from 'lucide-react'
import { api } from '../api'
import type { Flag } from '../types'

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
        enabled ? 'bg-violet-600' : 'bg-zinc-700'
      }`}
      aria-label={enabled ? 'Disable flag' : 'Enable flag'}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-4.5' : 'translate-x-0.5'
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
    <div className="max-w-5xl space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
          <input
            type="search"
            placeholder="Search flags…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>
        <div className="flex-1" />
        {error && (
          <button
            onClick={() => { setLoading(true); void load() }}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry
          </button>
        )}
        <Link
          to="/flags/new"
          className="flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New flag
        </Link>
      </div>

      {/* Table card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
            Loading…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-40 text-rose-400 text-sm">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            {query ? (
              <p className="text-zinc-600 text-sm">No flags match "<span className="text-zinc-400">{query}</span>"</p>
            ) : (
              <>
                <p className="text-zinc-600 text-sm">No flags yet.</p>
                <Link
                  to="/flags/new"
                  className="flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Create your first flag
                </Link>
              </>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">Key</th>
                <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider hidden md:table-cell">Description</th>
                <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">Rollout</th>
                <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider hidden sm:table-cell">Rules</th>
                <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">Enabled</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filtered.map(flag => (
                <tr key={flag.key} className="group hover:bg-zinc-800/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-violet-400 text-sm">{flag.key}</span>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <span className="text-zinc-400 truncate max-w-xs block">
                      {flag.description ?? <span className="text-zinc-700">—</span>}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-zinc-300">
                    {flag.rollout_percentage != null ? `${flag.rollout_percentage}%` : '100%'}
                  </td>
                  <td className="px-5 py-3.5 hidden sm:table-cell">
                    {flag.rules.length > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {flag.rules.length} rule{flag.rules.length !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <Toggle enabled={flag.is_enabled} onToggle={() => void toggleEnabled(flag)} />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        to={`/flags/${encodeURIComponent(flag.key)}/edit`}
                        className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                        aria-label="Edit flag"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        onClick={() => void handleDelete(flag.key)}
                        className="p-1.5 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
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
        )}

        {/* Footer */}
        {!loading && !error && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-zinc-800 text-xs text-zinc-600">
            {filtered.length} flag{filtered.length !== 1 ? 's' : ''}
            {query && ` matching "${query}"`}
          </div>
        )}
      </div>
    </div>
  )
}
