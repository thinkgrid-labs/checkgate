import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flag, ArrowRight, CheckCircle2, Shield, Zap, Globe } from 'lucide-react'
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
  const [sdkKey, setSdkKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleFinish() {
    setError('')
    setLoading(true)
    // Validate SDK key if provided (server may have no key set)
    if (sdkKey.trim()) {
      try {
        const res = await fetch('/api/flags', {
          headers: { Authorization: `Bearer ${sdkKey.trim()}` },
        })
        if (res.status === 401) {
          setError('SDK key was rejected by the server.')
          setLoading(false)
          return
        }
      } catch {
        setError('Could not reach the server. Make sure it is running.')
        setLoading(false)
        return
      }
    }
    completeSetup(name.trim(), email.trim(), sdkKey.trim())
    navigate('/')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-zinc-900 border-r border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <Flag className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-lg">Sidekick</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Feature flags that<br />move at the speed<br />of your code.
          </h1>
          <p className="text-zinc-400 text-lg mb-10">
            Self-hosted, open-source, and built in Rust. Ship faster — without the vendor tax.
          </p>
          <div className="space-y-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4">
                <div className="w-9 h-9 rounded-lg bg-violet-600/10 border border-violet-600/20 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{title}</p>
                  <p className="text-zinc-500 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-zinc-600 text-sm">MIT Licensed · Open Source</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-10">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                i < step ? 'bg-violet-600 text-white' :
                i === step ? 'bg-violet-600/20 text-violet-400 ring-1 ring-violet-500' :
                'bg-zinc-800 text-zinc-600'
              }`}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-px ${i < step ? 'bg-violet-600' : 'bg-zinc-800'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="w-full max-w-md">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-violet-600/10 border border-violet-600/20 flex items-center justify-center mx-auto mb-6">
                <Flag className="w-7 h-7 text-violet-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Welcome to Sidekick</h2>
              <p className="text-zinc-400 mb-8">
                Let's set up your control plane in under a minute. You'll create an admin account and configure access to your server.
              </p>
              <button
                onClick={() => setStep(1)}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg transition-colors"
              >
                Get started <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 1: Account details */}
          {step === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Create your admin account</h2>
              <p className="text-zinc-400 mb-6 text-sm">This account is stored locally in your browser.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Full name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="jane@company.com"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(0)} className="flex-1 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg transition-colors text-sm">
                  Back
                </button>
                <button
                  onClick={() => { if (name.trim() && email.trim()) setStep(2) }}
                  disabled={!name.trim() || !email.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: SDK key */}
          {step === 2 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Connect to your server</h2>
              <p className="text-zinc-400 mb-6 text-sm">
                Enter your server's <code className="text-violet-400 bg-violet-400/10 px-1 rounded text-xs">SDK_KEY</code>. Leave blank if authentication is disabled.
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">SDK Key</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={sdkKey}
                    onChange={e => { setSdkKey(e.target.value); setError('') }}
                    placeholder="sk_prod_… (optional)"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 pr-20 text-white placeholder-zinc-600 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-zinc-600">
                  Set via <code className="text-zinc-500">SDK_KEY</code> env var on the server. Can be changed later in Settings.
                </p>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg transition-colors text-sm">
                  Back
                </button>
                <button
                  onClick={() => void handleFinish()}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
                >
                  {loading ? 'Connecting…' : <><CheckCircle2 className="w-4 h-4" /> Finish setup</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
