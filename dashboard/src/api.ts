import type { Flag, FlagPatch } from './types'

export interface ApiUser {
  id: number
  email: string
  name: string
  role: string
  created_at: string
}

function baseUrl(): string {
  return import.meta.env.VITE_API_URL ?? ''
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    // `same-origin` ensures the HttpOnly session cookie is sent automatically.
    // Never `include` (would send cookies cross-origin) or `omit` (would break auth).
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      // CSRF defence-in-depth header. Cross-origin requests cannot include this
      // header because CORS only allows Authorization and Content-Type — so the
      // server's CSRF middleware effectively blocks cross-origin mutations.
      'X-Checkgate-Request': 'true',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status} ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  listFlags(): Promise<Flag[]> {
    return request('/api/flags')
  },

  getFlag(key: string): Promise<Flag> {
    return request(`/api/flags/${encodeURIComponent(key)}`)
  },

  createFlag(flag: Flag): Promise<Flag> {
    return request('/api/flags', {
      method: 'POST',
      body: JSON.stringify(flag),
    })
  },

  patchFlag(key: string, patch: FlagPatch): Promise<Flag> {
    return request(`/api/flags/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  deleteFlag(key: string): Promise<void> {
    return request(`/api/flags/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    })
  },
}

export const userApi = {
  list(): Promise<ApiUser[]> {
    return request('/api/users')
  },

  create(data: { name: string; email: string; role: string }): Promise<ApiUser> {
    return request('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  remove(id: number): Promise<void> {
    return request(`/api/users/${id}`, { method: 'DELETE' })
  },
}
