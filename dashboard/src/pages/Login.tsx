import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Flag, Eye, EyeOff, LogIn } from 'lucide-react'
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
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-zinc-900 border-r border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <Flag className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-lg">Checkgate</span>
        </div>

        <div>
          <blockquote className="text-3xl font-bold text-white leading-tight mb-4">
            "Ship features with confidence.<br />Roll back in seconds."
          </blockquote>
          <p className="text-zinc-400">
            Self-hosted feature flags built for teams that move fast.
          </p>
        </div>

        <p className="text-zinc-600 text-sm">MIT Licensed · Open Source · ThinkGrid Labs</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Mobile logo */}
        <div className="flex items-center gap-2 mb-10 lg:hidden">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <Flag className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-lg">Checkgate</span>
        </div>

        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-white mb-1">Welcome back</h2>
          <p className="text-zinc-400 text-sm mb-8">Sign in to your control plane.</p>

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="jane@company.com"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                SDK Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={sdkKey}
                  onChange={e => { setSdkKey(e.target.value); setError('') }}
                  placeholder="sk_prod_… (leave blank if auth is off)"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 pr-10 text-white placeholder-zinc-600 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm mt-2"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            No account yet?{' '}
            <Link to="/setup" className="text-violet-400 hover:text-violet-300 transition-colors">
              Run setup
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
