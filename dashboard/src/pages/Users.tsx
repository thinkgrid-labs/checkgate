import { useState } from 'react'
import { UserPlus, Trash2, Shield, Eye, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { User, UserRole } from '../types'

const inputClass =
  'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-shadow'

function RoleBadge({ role }: { role: UserRole }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-600/15 text-violet-400 border border-violet-600/25">
      <Shield className="w-3 h-3" /> Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
      <Eye className="w-3 h-3" /> Viewer
    </span>
  )
}

interface AddUserModalProps {
  onClose: () => void
  onAdd: (name: string, email: string, role: UserRole) => void
}

function AddUserModal({ onClose, onAdd }: AddUserModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.')
      return
    }
    onAdd(name.trim(), email.trim(), role)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="text-zinc-100 font-semibold">Add user</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Full name</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              placeholder="Jane Smith"
              className={inputClass}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              placeholder="jane@company.com"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Role</label>
            <div className="flex gap-3">
              {(['admin', 'viewer'] as UserRole[]).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
                    role === r
                      ? 'bg-violet-600/15 border-violet-600/40 text-violet-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                  }`}
                >
                  {r === 'admin' ? 'Admin' : 'Viewer'}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-zinc-600">
              {role === 'admin'
                ? 'Can create, edit, and delete flags.'
                : 'Read-only access to flags.'}
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Add user
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Users() {
  const { getUsers, addUser, removeUser, session } = useAuth()
  const [users, setUsers] = useState<User[]>(() => getUsers())
  const [showModal, setShowModal] = useState(false)

  const isAdmin = session?.user.role === 'admin'

  function handleAdd(name: string, email: string, role: UserRole) {
    const user = addUser({ name, email, role })
    setUsers(prev => [...prev, user])
  }

  function handleRemove(id: string) {
    if (id === session?.user.id) {
      alert("You can't remove your own account.")
      return
    }
    if (!confirm('Remove this user?')) return
    removeUser(id)
    setUsers(prev => prev.filter(u => u.id !== id))
  }

  return (
    <div className="max-w-3xl space-y-4">
      {showModal && (
        <AddUserModal
          onClose={() => setShowModal(false)}
          onAdd={handleAdd}
        />
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-zinc-500 text-sm">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        {isAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Add user
          </button>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">User</th>
              <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">Role</th>
              <th className="text-left px-5 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider hidden sm:table-cell">Joined</th>
              {isAdmin && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {users.map(user => (
              <tr key={user.id} className="group hover:bg-zinc-800/40 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-600/15 border border-violet-600/25 flex items-center justify-center shrink-0">
                      <span className="text-violet-400 text-xs font-semibold">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-zinc-200 font-medium flex items-center gap-2">
                        {user.name}
                        {user.id === session?.user.id && (
                          <span className="text-xs font-normal text-zinc-600">(you)</span>
                        )}
                      </p>
                      <p className="text-zinc-500 text-xs">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <RoleBadge role={user.role} />
                </td>
                <td className="px-5 py-3.5 text-zinc-500 text-xs hidden sm:table-cell">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                {isAdmin && (
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleRemove(user.id)}
                        disabled={user.id === session?.user.id}
                        className="p-1.5 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        aria-label="Remove user"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
