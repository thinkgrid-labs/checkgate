import { useEffect, useState } from 'react'
import { CalendarClock, Trash2 } from 'lucide-react'
import { scheduledApi } from '../api'
import { useEnvironment } from '../context/EnvironmentContext'
import type { ScheduledChange } from '../types'

function statusBadge(sc: ScheduledChange) {
  if (sc.executed_at) {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
        executed
      </span>
    )
  }
  const due = new Date(sc.scheduled_at).getTime()
  if (due < Date.now()) {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
        pending
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
      scheduled
    </span>
  )
}

function PatchPreview({ patch }: { patch: Record<string, unknown> }) {
  const entries = Object.entries(patch)
  if (entries.length === 0) {
    return <span className="text-gray-400 text-xs italic">empty patch</span>
  }
  return (
    <ul className="text-xs space-y-0.5 mt-1">
      {entries.map(([k, v]) => (
        <li key={k} className="font-mono">
          <span className="text-gray-500">{k}:</span>{' '}
          <span className="text-gray-800">{JSON.stringify(v)}</span>
        </li>
      ))}
    </ul>
  )
}

export default function Scheduled() {
  const { activeEnv } = useEnvironment()
  const [changes, setChanges] = useState<ScheduledChange[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function load() {
    if (!activeEnv) return
    setLoading(true)
    try {
      setChanges(await scheduledApi.list(activeEnv.id))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [activeEnv?.id])

  async function handleDelete(sc: ScheduledChange) {
    if (!activeEnv || !confirm(`Cancel scheduled change for "${sc.flag_key}"?`)) return
    setDeleting(sc.id)
    try {
      await scheduledApi.delete(activeEnv.id, sc.id)
      setChanges((c) => c.filter((x) => x.id !== sc.id))
    } catch (err) {
      alert(String(err))
    } finally {
      setDeleting(null)
    }
  }

  const pending = changes.filter((c) => !c.executed_at)
  const done = changes.filter((c) => c.executed_at)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scheduled Changes</h1>
        <p className="text-gray-500 text-sm mt-1">
          Upcoming flag patches queued to apply automatically in{' '}
          <span className="font-medium">{activeEnv?.name ?? 'this environment'}</span>.
        </p>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : changes.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-400">
          <CalendarClock className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p>No scheduled changes for this environment.</p>
          <p className="text-sm mt-1">
            Open a flag's editor and use the "Schedule" tab to queue a future patch.
          </p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                Upcoming ({pending.length})
              </h2>
              {pending.map((sc) => (
                <div
                  key={sc.id}
                  className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex gap-5"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 font-mono">{sc.flag_key}</span>
                      {statusBadge(sc)}
                    </div>
                    <p className="text-xs text-gray-500">
                      Scheduled for{' '}
                      <strong className="text-gray-700">
                        {new Date(sc.scheduled_at).toLocaleString()}
                      </strong>
                    </p>
                    <PatchPreview patch={sc.patch} />
                  </div>
                  <div className="shrink-0 flex items-start pt-0.5">
                    <button
                      onClick={() => handleDelete(sc)}
                      disabled={deleting === sc.id}
                      className="text-red-400 hover:text-red-600 disabled:opacity-40"
                      title="Cancel scheduled change"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {done.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                Executed ({done.length})
              </h2>
              {done.map((sc) => (
                <div
                  key={sc.id}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 opacity-70"
                >
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-gray-700 font-mono">{sc.flag_key}</span>
                    {statusBadge(sc)}
                  </div>
                  <p className="text-xs text-gray-500">
                    Executed at{' '}
                    <strong>{new Date(sc.executed_at!).toLocaleString()}</strong>
                    {' · '}
                    scheduled for {new Date(sc.scheduled_at).toLocaleString()}
                  </p>
                  <PatchPreview patch={sc.patch} />
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}
