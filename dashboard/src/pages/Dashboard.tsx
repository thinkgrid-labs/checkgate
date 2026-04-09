import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ToggleLeft, ToggleRight, ListFilter, Percent, Plus, ArrowRight } from 'lucide-react'
import { api } from '../api'
import type { Flag } from '../types'

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ElementType
  color: string
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-zinc-400 text-sm">{label}</p>
        <p className="text-2xl font-bold text-zinc-100 mt-0.5">{value}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [flags, setFlags] = useState<Flag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const enabled = flags.filter(f => f.is_enabled).length
  const withRules = flags.filter(f => f.rules.length > 0).length
  const withRollout = flags.filter(f => f.rollout_percentage != null).length

  return (
    <div className="max-w-5xl space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total flags"
          value={loading ? '—' : flags.length}
          icon={ToggleLeft}
          color="bg-violet-600/10 text-violet-400"
        />
        <StatCard
          label="Enabled"
          value={loading ? '—' : enabled}
          icon={ToggleRight}
          color="bg-emerald-500/10 text-emerald-400"
        />
        <StatCard
          label="With rules"
          value={loading ? '—' : withRules}
          icon={ListFilter}
          color="bg-amber-500/10 text-amber-400"
        />
        <StatCard
          label="Partial rollout"
          value={loading ? '—' : withRollout}
          icon={Percent}
          color="bg-sky-500/10 text-sky-400"
        />
      </div>

      {/* Flags table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-zinc-100 font-semibold text-sm">Recent flags</h2>
          <Link
            to="/flags"
            className="flex items-center gap-1 text-violet-400 hover:text-violet-300 text-sm font-medium transition-colors"
          >
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">
            Loading…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-rose-400 text-sm">
            {error}
          </div>
        ) : flags.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3">
            <p className="text-zinc-600 text-sm">No flags yet.</p>
            <Link
              to="/flags/new"
              className="flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Create your first flag
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">Key</th>
                <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">Description</th>
                <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">Rollout</th>
                <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {flags.slice(0, 8).map(flag => (
                <tr key={flag.key} className="hover:bg-zinc-800/50 transition-colors">
                  <td className="px-5 py-3">
                    <Link
                      to={`/flags/${encodeURIComponent(flag.key)}/edit`}
                      className="font-mono text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      {flag.key}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-zinc-400 max-w-xs truncate">
                    {flag.description ?? <span className="text-zinc-700">No description</span>}
                  </td>
                  <td className="px-5 py-3 text-zinc-300">
                    {flag.rollout_percentage != null ? `${flag.rollout_percentage}%` : '100%'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                      flag.is_enabled
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${flag.is_enabled ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                      {flag.is_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
