import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flag, ArrowRight, CheckCircle2, Shield, Zap, Globe, Copy, Check, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const STEPS = ['Welcome', 'Your account', 'SDK key', 'Done'] as const

const FEATURES = [
  { icon: Zap, title: 'Sub-microsecond evaluation', desc: 'Flags evaluated in-process — no network calls.' },
  { icon: Globe, title: 'Real-time updates', desc: 'SSE push propagates changes in < 50 ms.' },
  { icon: Shield, title: 'Self-hosted & private', desc: 'Your data never leaves your infrastructure.' },
]

export default function Setup() {
  const { completeSetup } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  // SDK key fetched from server
  const [sdkKey, setSdkKey] = useState('')
  const [keyLoading, setKeyLoading] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Fetch the generated key when the user reaches step 2.
  useEffect(() => {
    if (step !== 2 || sdkKey) return
    setKeyLoading(true)
    setKeyError('')
    fetch('/api/setup/key', { credentials: 'same-origin' })
      .then(async res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`)
        const data = await res.json() as { key: string }
        setSdkKey(data.key)
      })
      .catch(() => setKeyError('Could not load the SDK key. Is the server running?'))
      .finally(() => setKeyLoading(false))
  }, [step, sdkKey])

  async function handleCopy() {
    await navigator.clipboard.writeText(sdkKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleFinish() {
    setError('')
    setLoading(true)
    const result = await completeSetup(name.trim(), email.trim(), sdkKey)
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'Setup failed.')
      return
    }
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-white border-r border-gray-200">
        <div className="flex items-center gap-3">
          <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-50 overflow-hidden">
            <img src="/checkgate_logo.png" alt="" className="h-7 w-7 object-contain" />
          </div>
          <span className="text-gray-900 font-display font-bold text-2xl tracking-tight">Checkgate</span>
        </div>

        <div className="max-w-sm">
          <h1 className="text-4xl font-display font-bold text-gray-900 leading-[1.1] mb-6 tracking-tight">
            Feature flags <br />
            built for the <br />
            <span className="text-emerald-600">modern web.</span>
          </h1>
          <p className="text-gray-500 text-lg font-medium leading-relaxed mb-10">
            Self-hosted, open-source, and built in Rust. Ship faster — without the vendor tax.
          </p>
          <div className="space-y-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-gray-900 font-medium text-sm">{title}</p>
                  <p className="text-gray-500 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-gray-400 text-sm">MIT Licensed · Open Source</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-10">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition-all shadow-sm ${
                i < step ? 'bg-emerald-600 text-white shadow-emerald-200' :
                i === step ? 'bg-emerald-50 text-emerald-600 ring-2 ring-emerald-500/20' :
                'bg-gray-100 text-gray-400'
              }`}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-10 h-1 ${i < step ? 'bg-emerald-600' : 'bg-gray-100'} rounded-full`} />
              )}
            </div>
          ))}
        </div>

        <div className="w-full max-w-md bg-white p-12 rounded-3xl shadow-premium-xl border border-gray-50">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-6">
                <Flag className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Checkgate</h2>
              <p className="text-gray-500 mb-8">
                Let's set up your control plane in under a minute. You'll create an admin account and get your SDK key.
              </p>
              <button
                onClick={() => setStep(1)}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-200 hover:shadow-emerald-300 hover:-translate-y-0.5"
              >
                Get started <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 1: Account details */}
          {step === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Create your admin account</h2>
              <p className="text-gray-500 mb-6 text-sm">This account is stored securely on the server.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full bg-white border border-gray-100 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/30 transition-all shadow-premium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="jane@company.com"
                    className="w-full bg-white border border-gray-100 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/30 transition-all shadow-premium"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(0)} className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium rounded-lg transition-colors text-sm">
                  Back
                </button>
                <button
                  onClick={() => { if (name.trim() && email.trim()) setStep(2) }}
                  disabled={!name.trim() || !email.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: SDK key — auto-generated by the server */}
          {step === 2 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Your SDK key</h2>
              <p className="text-gray-500 mb-6 text-sm">
                This key was generated automatically. It authenticates SDK clients and your dashboard login.
                <strong className="text-gray-700"> Save it now — it won't be shown again.</strong>
              </p>

              {keyError && (
                <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {keyError}
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 text-sm">
                  {error}
                </div>
              )}

              {/* Key display */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">SDK Key</label>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  {keyLoading ? (
                    <span className="inline-block w-4 h-4 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
                  ) : (
                    <code className="flex-1 text-emerald-600 text-sm font-mono break-all leading-relaxed">
                      {sdkKey || '—'}
                    </code>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    disabled={!sdkKey}
                    className="shrink-0 p-1.5 rounded-md bg-white border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                    title="Copy to clipboard"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirmation checkbox */}
              <label className="flex items-start gap-3 cursor-pointer select-none mb-6">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                  className="mt-0.5 accent-emerald-500"
                />
                <span className="text-sm text-gray-500">
                  I've copied and saved my SDK key. I understand it won't be shown again.
                </span>
              </label>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-all text-sm">
                  Back
                </button>
                <button
                  onClick={() => void handleFinish()}
                  disabled={loading || !confirmed || !sdkKey}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-200 hover:shadow-emerald-300 hover:-translate-y-0.5"
                >
                  {loading
                    ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><CheckCircle2 className="w-4 h-4" /> Finish setup</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
