import type { Flag, FlagPatch } from './types'

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
      // CSRF protection header — cross-site requests cannot set custom headers
      // without explicit CORS permission, which we do not grant to anyone.
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
