import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { api } from '../api'
import type { Flag, FlagType, FlagValue, TargetingRule } from '../types'
import RuleEditor from '../components/RuleEditor'
import { useEnvironment } from '../context/EnvironmentContext'

const EMPTY_FLAG: Flag = {
  key: '',
  is_enabled: true,
  rollout_percentage: null,
  description: null,
  rules: [],
  flag_type: 'boolean',
  default_value: null,
  disabled_value: null,
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="premium-card shadow-premium-lg border-none">
      <div className="px-6 py-4 border-b border-gray-50 bg-white">
        <h2 className="text-gray-900 font-display font-bold text-sm tracking-tight">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/20 ${
        enabled ? 'bg-emerald-600 shadow-md shadow-emerald-200' : 'bg-gray-200'
      }`}
      aria-label={enabled ? 'Disable flag' : 'Enable flag'}
    >
      <span
        className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${
          enabled ? 'translate-x-6' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

const inputClass =
  'w-full bg-white border border-gray-100 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/30 transition-all shadow-premium disabled:opacity-50 disabled:cursor-not-allowed'

const selectClass =
  'w-full bg-white border border-gray-100 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/30 transition-all shadow-premium appearance-none disabled:opacity-50 disabled:cursor-not-allowed'

const FLAG_TYPES: { value: FlagType; label: string; description: string }[] = [
  { value: 'boolean', label: 'Boolean', description: 'On / off toggle' },
  { value: 'string', label: 'String', description: 'Text value (e.g. "variant-a", "dark")' },
  { value: 'integer', label: 'Integer', description: 'Whole number (e.g. 42, 100)' },
  { value: 'json', label: 'JSON', description: 'Arbitrary object or array' },
]

function parseValue(raw: string, flagType: FlagType): FlagValue {
  if (raw.trim() === '') return null
  if (flagType === 'integer') {
    const n = parseInt(raw, 10)
    return isNaN(n) ? null : n
  }
  if (flagType === 'json') {
    try { return JSON.parse(raw) } catch { return null }
  }
  return raw
}

function valueToString(v: FlagValue): string {
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}

function ValueInput({
  label,
  hint,
  value,
  flagType,
  onChange,
}: {
  label: string
  hint?: string
  value: FlagValue
  flagType: FlagType
  onChange: (v: FlagValue) => void
}) {
  const raw = valueToString(value)
  const base = `${inputClass}`

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {flagType === 'json' ? (
        <textarea
          rows={3}
          value={raw}
          onChange={e => onChange(parseValue(e.target.value, flagType))}
          placeholder='{"key": "value"}'
          className={`${base} font-mono text-xs resize-none`}
        />
      ) : (
        <input
          type={flagType === 'integer' ? 'number' : 'text'}
          value={raw}
          onChange={e => onChange(parseValue(e.target.value, flagType))}
          placeholder={flagType === 'integer' ? '0' : 'value'}
          className={base}
        />
      )}
      {hint && <p className="mt-1.5 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

export default function FlagEditor() {
  const { key } = useParams<{ key?: string }>()
  const isEdit = Boolean(key)
  const navigate = useNavigate()
  const { activeEnv } = useEnvironment()

  const [flag, setFlag] = useState<Flag>(EMPTY_FLAG)
  const [rolloutInput, setRolloutInput] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!key || !activeEnv) return
    api.getFlag(activeEnv.id, key)
      .then(f => {
        setFlag(f)
        setRolloutInput(f.rollout_percentage != null ? String(f.rollout_percentage) : '')
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load flag'))
      .finally(() => setLoading(false))
  }, [key, activeEnv])

  function setField<K extends keyof Flag>(field: K, value: Flag[K]) {
    setFlag(prev => ({ ...prev, [field]: value }))
  }

  function handleTypeChange(newType: FlagType) {
    setFlag(prev => ({
      ...prev,
      flag_type: newType,
      default_value: null,
      disabled_value: null,
      rules: prev.rules.map(r => ({ ...r, variant: undefined })),
    }))
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

    if (!activeEnv) {
      setError('No active environment selected.')
      setSaving(false)
      return
    }

    try {
      if (isEdit && key) {
        await api.patchFlag(activeEnv.id, key, {
          is_enabled: payload.is_enabled,
          rollout_percentage: payload.rollout_percentage,
          description: payload.description,
          rules: payload.rules,
          flag_type: payload.flag_type,
          default_value: payload.default_value,
          disabled_value: payload.disabled_value,
        })
      } else {
        await api.createFlag(activeEnv.id, payload)
      }
      navigate('/flags')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const flagType = flag.flag_type ?? 'boolean'
  const isVariant = flagType !== 'boolean'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl space-y-5">
      <Link
        to="/flags"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to flags
      </Link>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={e => void handleSubmit(e)} className="space-y-5">
        <SectionCard title="Basic info">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                <p className="mt-1.5 text-xs text-gray-400">
                  Immutable after creation. Use <code className="text-gray-600">snake_case</code>.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
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

        <SectionCard title="Flag type">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
              <select
                value={flagType}
                onChange={e => handleTypeChange(e.target.value as FlagType)}
                disabled={isEdit}
                className={selectClass}
              >
                {FLAG_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label} — {t.description}</option>
                ))}
              </select>
              {isEdit && (
                <p className="mt-1.5 text-xs text-gray-400">
                  Flag type cannot be changed after creation.
                </p>
              )}
            </div>

            {isVariant && (
              <>
                <ValueInput
                  label="Default value"
                  hint="Returned when the flag is enabled and no targeting rule overrides it."
                  value={flag.default_value ?? null}
                  flagType={flagType}
                  onChange={v => setField('default_value', v)}
                />
                <ValueInput
                  label="Disabled value"
                  hint="Returned when the flag is disabled or the user is outside the rollout."
                  value={flag.disabled_value ?? null}
                  flagType={flagType}
                  onChange={v => setField('disabled_value', v)}
                />
              </>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Rollout">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Enabled</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isVariant
                    ? 'When disabled, returns the disabled value.'
                    : <>When disabled, always evaluates to <code className="text-gray-600">false</code>.</>}
                </p>
              </div>
              <Toggle enabled={flag.is_enabled} onToggle={() => setField('is_enabled', !flag.is_enabled)} />
            </div>

            <div className="border-t border-gray-100 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Rollout percentage</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={rolloutInput}
                  onChange={e => setRolloutInput(e.target.value)}
                  placeholder="100"
                  className="w-28 bg-white border border-gray-100 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/30 transition-all shadow-premium"
                />
                <span className="text-gray-400 text-sm">%</span>
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                Leave empty for 100%. Users are bucketed deterministically by their key.
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Targeting rules">
          <p className="text-xs text-gray-400 mb-4">
            {isVariant
              ? 'Users matching a rule return that rule\'s value (or the default value if no per-rule value is set), bypassing the rollout cap.'
              : 'Users matching any rule always see the flag as enabled, bypassing the rollout cap.'}
          </p>
          <RuleEditor
            rules={flag.rules as TargetingRule[]}
            onChange={rules => setField('rules', rules)}
            flagType={flagType}
          />
        </SectionCard>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-emerald-200 hover:shadow-emerald-300 hover:-translate-y-0.5"
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
            className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
