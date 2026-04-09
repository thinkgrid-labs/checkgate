import { Trash2, Plus } from 'lucide-react'
import type { TargetingRule, Operator } from '../types'

const OPERATORS: { value: Operator; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
]

const inputClass =
  'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-shadow'

const selectClass =
  'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-shadow appearance-none'

interface RuleEditorProps {
  rules: TargetingRule[]
  onChange: (rules: TargetingRule[]) => void
}

export default function RuleEditor({ rules, onChange }: RuleEditorProps) {
  function addRule() {
    onChange([...rules, { attribute: '', operator: 'equals', values: [''] }])
  }

  function removeRule(i: number) {
    onChange(rules.filter((_, idx) => idx !== i))
  }

  function updateRule(i: number, partial: Partial<TargetingRule>) {
    onChange(rules.map((r, idx) => (idx === i ? { ...r, ...partial } : r)))
  }

  function updateValues(i: number, raw: string) {
    const values = raw.split(',').map(v => v.trim()).filter(Boolean)
    updateRule(i, { values: values.length ? values : [''] })
  }

  return (
    <div className="space-y-3">
      {rules.map((rule, i) => (
        <div
          key={i}
          className="flex flex-wrap gap-3 items-end p-4 bg-zinc-800/60 rounded-lg border border-zinc-700/60"
        >
          <div className="flex-1 min-w-32">
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">Attribute</label>
            <input
              type="text"
              value={rule.attribute}
              onChange={e => updateRule(i, { attribute: e.target.value })}
              placeholder="e.g. email"
              className={inputClass}
            />
          </div>

          <div className="w-44">
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">Operator</label>
            <select
              value={rule.operator}
              onChange={e => updateRule(i, { operator: e.target.value as Operator })}
              className={selectClass}
            >
              {OPERATORS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-40">
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">
              Values <span className="text-zinc-700">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={rule.values.join(', ')}
              onChange={e => updateValues(i, e.target.value)}
              placeholder="e.g. @acme.com, @example.com"
              className={inputClass}
            />
          </div>

          <button
            type="button"
            onClick={() => removeRule(i)}
            className="mb-0.5 p-2 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            aria-label="Remove rule"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRule}
        className="flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 font-medium transition-colors"
      >
        <Plus className="w-4 h-4" /> Add rule
      </button>
    </div>
  )
}
