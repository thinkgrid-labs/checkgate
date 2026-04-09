import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { api } from '../api'
import type { Flag, TargetingRule } from '../types'
import RuleEditor from '../components/RuleEditor'

const EMPTY_FLAG: Flag = {
  key: '',
  is_enabled: true,
  rollout_percentage: null,
  description: null,
  rules: [],
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-800">
        <h2 className="text-zinc-200 font-medium text-sm">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
        enabled ? 'bg-violet-600' : 'bg-zinc-700'
      }`}
      aria-label={enabled ? 'Disable flag' : 'Enable flag'}
    >
      <span
        className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-5.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

const inputClass =
  'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-shadow disabled:opacity-50 disabled:cursor-not-allowed'

export default function FlagEditor() {
  const { key } = useParams<{ key?: string }>()
  const isEdit = Boolean(key)
  const navigate = useNavigate()

  const [flag, setFlag] = useState<Flag>(EMPTY_FLAG)
  const [rolloutInput, setRolloutInput] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!key) return
    api.getFlag(key)
      .then(f => {
        setFlag(f)
        setRolloutInput(f.rollout_percentage != null ? String(f.rollout_percentage) : '')
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load flag'))
      .finally(() => setLoading(false))
  }, [key])

  function setField<K extends keyof Flag>(field: K, value: Flag[K]) {
    setFlag(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const rollout = rolloutInput.trim() === '' ? null : parseInt(rolloutInput, 10)
    if (rollout !== null && (isNaN(rollout) || rollout < 0 || rollout > 100)) {
      setError('Rollout percentage must be 0–100 or empty.')
      setSaving(false)
      return
    }

    const payload: Flag = { ...flag, rollout_percentage: rollout }

    try {
      if (isEdit && key) {
        await api.patchFlag(key, {
          is_enabled: payload.is_enabled,
          rollout_percentage: payload.rollout_percentage,
          description: payload.description,
          rules: payload.rules,
        })
      } else {
        await api.createFlag(payload)
      }
      navigate('/flags')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Back link */}
      <Link
        to="/flags"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-200 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to flags
      </Link>

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={e => void handleSubmit(e)} className="space-y-5">
        <SectionCard title="Basic info">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Key <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                disabled={isEdit}
                value={flag.key}
                onChange={e => setField('key', e.target.value)}
                placeholder="e.g. dark_mode"
                className={`${inputClass} font-mono`}
              />
              {!isEdit && (
                <p className="mt-1.5 text-xs text-zinc-600">
                  Immutable after creation. Use <code className="text-zinc-500">snake_case</code>.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
              <input
                type="text"
                value={flag.description ?? ''}
                onChange={e => setField('description', e.target.value || null)}
                placeholder="What does this flag control?"
                className={inputClass}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Rollout">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-300">Enabled</p>
                <p className="text-xs text-zinc-600 mt-0.5">
                  When disabled, the flag always evaluates to <code className="text-zinc-500">false</code>.
                </p>
              </div>
              <Toggle enabled={flag.is_enabled} onToggle={() => setField('is_enabled', !flag.is_enabled)} />
            </div>

            <div className="border-t border-zinc-800 pt-4">
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Rollout percentage</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={rolloutInput}
                  onChange={e => setRolloutInput(e.target.value)}
                  placeholder="100"
                  className="w-28 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
                <span className="text-zinc-500 text-sm">%</span>
              </div>
              <p className="mt-1.5 text-xs text-zinc-600">
                Leave empty for 100%. Users are bucketed deterministically by their key.
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Targeting rules">
          <p className="text-xs text-zinc-600 mb-4">
            Users matching any rule always see the flag as enabled, bypassing the rollout cap.
          </p>
          <RuleEditor
            rules={flag.rules as TargetingRule[]}
            onChange={rules => setField('rules', rules)}
          />
        </SectionCard>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create flag'}
          </button>
          <Link
            to="/flags"
            className="px-4 py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
