import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [sdkKey, setSdkKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(email.trim(), sdkKey.trim())
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'Login failed.')
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-5/12 flex-col justify-between p-12 bg-white border-r border-gray-200">
        <div className="flex items-center gap-3">
          <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-50 overflow-hidden">
            <img src="/checkgate_logo.png" alt="" className="h-7 w-7 object-contain" />
          </div>
          <span className="text-gray-900 font-display font-bold text-2xl tracking-tight">Checkgate</span>
        </div>

        <div className="max-w-sm">
          <blockquote className="text-4xl font-display font-bold text-gray-900 leading-[1.1] mb-6 tracking-tight">
            Ship with confidence. <span className="text-emerald-600">Roll back in seconds.</span>
          </blockquote>
          <p className="text-gray-500 text-lg font-medium leading-relaxed">
            Self-hosted feature flags built for teams that move fast.
          </p>
        </div>

        <div className="flex items-center gap-3 text-gray-400 text-sm font-medium">
          <span className="px-2 py-1 bg-gray-50 rounded-md border border-gray-100">MIT Licensed</span>
          <span className="w-1 h-1 bg-gray-300 rounded-full" />
          <span>ThinkGrid Labs</span>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50/50">
        {/* Mobile logo */}
        <div className="flex items-center gap-3 mb-8 lg:hidden">
          <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-50 overflow-hidden">
            <img src="/checkgate_logo.png" alt="" className="h-6 w-6 object-contain" />
          </div>
          <span className="text-gray-900 font-display font-bold text-xl tracking-tight">Checkgate</span>
        </div>

        <div className="w-full max-w-md bg-white p-10 rounded-3xl shadow-premium-xl border border-gray-50">
          <h2 className="text-3xl font-display font-bold text-gray-900 tracking-tight mb-2 text-center sm:text-left">Welcome back</h2>
          <p className="text-gray-400 text-sm mb-10 text-center sm:text-left font-medium">Sign in to your control plane.</p>

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="jane@company.com"
                className="w-full bg-white border border-gray-100 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/30 transition-all shadow-premium"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                SDK Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={sdkKey}
                  onChange={e => { setSdkKey(e.target.value); setError('') }}
                  placeholder="sk_live_… (leave blank if auth is off)"
                  className="w-full bg-white border border-gray-100 rounded-xl px-4 py-2.5 pr-10 text-gray-900 placeholder-gray-400 text-sm font-mono focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/30 transition-all shadow-premium"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-200 hover:shadow-emerald-300 hover:-translate-y-0.5 text-sm mt-4"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            No account yet?{' '}
            <Link to="/setup" className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors">
              Run setup
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
