import { useEffect, useState, useCallback } from 'react'
import { Activity, Users, TrendingUp, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../api'
import type { Impression, ImpressionStats } from '../types'
import { useEnvironment } from '../context/EnvironmentContext'

const PAGE_SIZE = 50

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  sub?: string
}) {
  return (
    <div className="premium-card bg-white p-5 flex items-start gap-4">
      <div className="p-2.5 bg-emerald-50 rounded-xl">
        <Icon className="w-5 h-5 text-emerald-600" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
        <p className="text-2xl font-display font-bold text-gray-900 leading-none">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function ValueBadge({ value }: { value: string }) {
  const isTrue = value === 'true'
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
        isTrue
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
          : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'
      }`}
    >
      {value}
    </span>
  )
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Per-flag stats table
// ---------------------------------------------------------------------------

function StatsTable({ stats }: { stats: ImpressionStats[] }) {
  if (stats.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        No evaluations recorded yet.
      </div>
    )
  }

  const maxTotal = Math.max(...stats.map(s => s.total), 1)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-50 bg-gray-50/50">
            <th className="text-left px-6 py-3 text-gray-400 font-bold text-[10px] uppercase tracking-widest">Flag</th>
            <th className="text-left px-6 py-3 text-gray-400 font-bold text-[10px] uppercase tracking-widest">Evaluations</th>
            <th className="text-left px-6 py-3 text-gray-400 font-bold text-[10px] uppercase tracking-widest hidden sm:table-cell">True / False</th>
            <th className="text-left px-6 py-3 text-gray-400 font-bold text-[10px] uppercase tracking-widest hidden md:table-cell">Unique users</th>
            <th className="text-left px-6 py-3 text-gray-400 font-bold text-[10px] uppercase tracking-widest hidden lg:table-cell">Last seen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50/50">
          {stats.map(s => {
            const trueRatio = s.total > 0 ? (s.true_count / s.total) * 100 : 0
            const barWidth = (s.total / maxTotal) * 100
            return (
              <tr key={s.flag_key} className="hover:bg-emerald-50/20 transition-all">
                <td className="px-6 py-4">
                  <span className="font-mono text-emerald-600 font-semibold text-sm">{s.flag_key}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-900 tabular-nums w-12">{s.total.toLocaleString()}</span>
                    <div className="flex-1 max-w-[120px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 hidden sm:table-cell">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 max-w-[80px] h-2 bg-gray-100 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-400 rounded-l-full"
                        style={{ width: `${trueRatio}%` }}
                      />
                      <div
                        className="h-full bg-gray-300 rounded-r-full"
                        style={{ width: `${100 - trueRatio}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {s.true_count.toLocaleString()} / {s.false_count.toLocaleString()}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 hidden md:table-cell text-gray-600 tabular-nums">
                  {s.unique_users.toLocaleString()}
                </td>
                <td className="px-6 py-4 hidden lg:table-cell text-gray-400 text-xs">
                  {s.last_seen ? formatTime(s.last_seen) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recent evaluations stream
// ---------------------------------------------------------------------------

function StreamTable({
  items,
  total,
  offset,
  onPage,
}: {
  items: Impression[]
  total: number
  offset: number
  onPage: (next: number) => void
}) {
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (items.length === 0 && total === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        No evaluations recorded yet.
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 bg-gray-50/50">
              <th className="text-left px-6 py-3 text-gray-400 font-bold text-[10px] uppercase tracking-widest">Time</th>
              <th className="text-left px-6 py-3 text-gray-400 font-bold text-[10px] uppercase tracking-widest">Flag</th>
              <th className="text-left px-6 py-3 text-gray-400 font-bold text-[10px] uppercase tracking-widest">Value</th>
              <th className="text-left px-6 py-3 text-gray-400 font-bold text-[10px] uppercase tracking-widest hidden sm:table-cell">User</th>
              <th className="text-left px-6 py-3 text-gray-400 font-bold text-[10px] uppercase tracking-widest hidden lg:table-cell">Context</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50/50">
            {items.map(imp => (
              <tr key={imp.id} className="hover:bg-emerald-50/20 transition-all">
                <td className="px-6 py-3.5 text-gray-400 text-xs tabular-nums whitespace-nowrap">
                  {formatTime(imp.evaluated_at)}
                </td>
                <td className="px-6 py-3.5">
                  <span className="font-mono text-emerald-600 font-semibold text-xs">{imp.flag_key}</span>
                </td>
                <td className="px-6 py-3.5">
                  <ValueBadge value={imp.value} />
                </td>
                <td className="px-6 py-3.5 hidden sm:table-cell text-gray-500 text-xs font-mono">
                  {imp.user_id ?? <span className="text-gray-300">anonymous</span>}
                </td>
                <td className="px-6 py-3.5 hidden lg:table-cell">
                  {imp.context ? (
                    <code className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded max-w-[200px] truncate block">
                      {JSON.stringify(imp.context)}
                    </code>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-400">
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total.toLocaleString()} evaluations
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPage(offset - PAGE_SIZE)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-semibold text-gray-600">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => onPage(offset + PAGE_SIZE)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Impressions() {
  const { activeEnv } = useEnvironment()
  const [stats, setStats] = useState<ImpressionStats[]>([])
  const [items, setItems] = useState<Impression[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [flagFilter, setFlagFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    if (!activeEnv) return
    const s = await api.impressionStats(activeEnv.id)
    setStats(s)
  }, [activeEnv])

  const loadStream = useCallback(async () => {
    if (!activeEnv) return
    const res = await api.listImpressions(activeEnv.id, {
      flagKey: flagFilter.trim() || undefined,
      limit: PAGE_SIZE,
      offset,
    })
    setItems(res.items)
    setTotal(res.total)
  }, [activeEnv, flagFilter, offset])

  const load = useCallback(async () => {
    if (!activeEnv) return
    setLoading(true)
    setError(null)
    try {
      await Promise.all([loadStats(), loadStream()])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load impressions')
    } finally {
      setLoading(false)
    }
  }, [activeEnv, loadStats, loadStream])

  useEffect(() => {
    setOffset(0)
  }, [flagFilter, activeEnv])

  useEffect(() => {
    void load()
  }, [load])

  const totalEvals = stats.reduce((sum, s) => sum + s.total, 0)
  const totalUsers = stats.reduce((sum, s) => sum + s.unique_users, 0)
  const topFlag = stats[0]?.flag_key ?? '—'

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900">Impressions</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Flag evaluation events reported by SDK clients
            {activeEnv && (
              <span className="ml-2 inline-flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: activeEnv.color }}
                />
                {activeEnv.name}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total evaluations"
          value={totalEvals.toLocaleString()}
          icon={Activity}
        />
        <StatCard
          label="Unique users"
          value={totalUsers.toLocaleString()}
          icon={Users}
          sub="across all flags"
        />
        <StatCard
          label="Most evaluated"
          value={topFlag}
          icon={TrendingUp}
          sub={topFlag !== '—' ? `${stats[0]?.total.toLocaleString()} evals` : undefined}
        />
      </div>

      {error && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-sm">
          {error}
        </div>
      )}

      {/* Per-flag stats */}
      <div className="premium-card bg-white shadow-premium-lg border-none">
        <div className="px-6 py-4 border-b border-gray-50">
          <h2 className="font-bold text-gray-900">By flag</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
        ) : (
          <StatsTable stats={stats} />
        )}
      </div>

      {/* Recent evaluations stream */}
      <div className="premium-card bg-white shadow-premium-lg border-none">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-3">
          <h2 className="font-bold text-gray-900 flex-1">Recent evaluations</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="search"
              placeholder="Filter by flag…"
              value={flagFilter}
              onChange={e => setFlagFilter(e.target.value)}
              className="bg-gray-50 border border-gray-100 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-52"
            />
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
        ) : (
          <StreamTable
            items={items}
            total={total}
            offset={offset}
            onPage={setOffset}
          />
        )}
      </div>
    </div>
  )
}
