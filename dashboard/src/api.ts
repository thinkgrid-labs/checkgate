import type {
  AuditEntry,
  ConnectedClient,
  Flag,
  FlagPatch,
  ImpressionListResponse,
  ImpressionStats,
  ScheduledChange,
  Segment,
  SegmentPatch,
  Webhook,
  WebhookDelivery,
  WebhookPatch,
} from './types'

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
    const text = await res.text().catch(() => '')
    try {
      const json = JSON.parse(text) as { error?: string }
      if (json.error) throw new Error(json.error)
    } catch (e) {
      if (e instanceof SyntaxError === false) throw e
    }
    throw new Error(text || res.statusText || `Error ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  listFlags(envId: string): Promise<Flag[]> {
    return request(`/api/environments/${envId}/flags`)
  },

  getFlag(envId: string, key: string): Promise<Flag> {
    return request(`/api/environments/${envId}/flags/${encodeURIComponent(key)}`)
  },

  createFlag(envId: string, flag: Flag): Promise<Flag> {
    return request(`/api/environments/${envId}/flags`, {
      method: 'POST',
      body: JSON.stringify(flag),
    })
  },

  patchFlag(envId: string, key: string, patch: FlagPatch): Promise<Flag> {
    return request(`/api/environments/${envId}/flags/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  deleteFlag(envId: string, key: string): Promise<void> {
    return request(`/api/environments/${envId}/flags/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    })
  },

  promoteFlag(envId: string, key: string, targetEnvId: string): Promise<Flag> {
    return request(`/api/environments/${envId}/flags/${encodeURIComponent(key)}/promote`, {
      method: 'POST',
      body: JSON.stringify({ target_env_id: targetEnvId }),
    })
  },

  listImpressions(
    envId: string,
    opts: {
      flagKey?: string
      userId?: string
      value?: string
      sinceId?: number
      limit?: number
      offset?: number
    } = {},
  ): Promise<ImpressionListResponse> {
    const params = new URLSearchParams()
    if (opts.flagKey) params.set('flag_key', opts.flagKey)
    if (opts.userId) params.set('user_id', opts.userId)
    if (opts.value) params.set('value', opts.value)
    if (opts.sinceId != null) params.set('since_id', String(opts.sinceId))
    if (opts.limit != null) params.set('limit', String(opts.limit))
    if (opts.offset != null) params.set('offset', String(opts.offset))
    const qs = params.toString()
    return request(`/api/environments/${envId}/impressions${qs ? `?${qs}` : ''}`)
  },

  impressionStats(envId: string): Promise<ImpressionStats[]> {
    return request(`/api/environments/${envId}/impressions/stats`)
  },
}

export const auditApi = {
  list(
    envId: string,
    opts: { flagKey?: string; limit?: number; offset?: number } = {},
  ): Promise<AuditEntry[]> {
    const params = new URLSearchParams()
    if (opts.flagKey) params.set('flag_key', opts.flagKey)
    if (opts.limit != null) params.set('limit', String(opts.limit))
    if (opts.offset != null) params.set('offset', String(opts.offset))
    const qs = params.toString()
    return request(`/api/environments/${envId}/audit${qs ? `?${qs}` : ''}`)
  },
}

export const segmentsApi = {
  list(envId: string): Promise<Segment[]> {
    return request(`/api/environments/${envId}/segments`)
  },

  get(envId: string, key: string): Promise<Segment> {
    return request(`/api/environments/${envId}/segments/${encodeURIComponent(key)}`)
  },

  create(
    envId: string,
    data: { name: string; key: string; description?: string; rules?: Segment['rules'] },
  ): Promise<Segment> {
    return request(`/api/environments/${envId}/segments`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  patch(envId: string, key: string, patch: SegmentPatch): Promise<Segment> {
    return request(`/api/environments/${envId}/segments/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  delete(envId: string, key: string): Promise<void> {
    return request(`/api/environments/${envId}/segments/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    })
  },
}

export const webhooksApi = {
  list(envId: string): Promise<Webhook[]> {
    return request(`/api/environments/${envId}/webhooks`)
  },

  create(
    envId: string,
    data: { name: string; url: string; secret?: string; enabled?: boolean },
  ): Promise<Webhook> {
    return request(`/api/environments/${envId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  patch(envId: string, id: string, patch: WebhookPatch): Promise<Webhook> {
    return request(`/api/environments/${envId}/webhooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  delete(envId: string, id: string): Promise<void> {
    return request(`/api/environments/${envId}/webhooks/${id}`, { method: 'DELETE' })
  },

  listDeliveries(envId: string, webhookId: string): Promise<WebhookDelivery[]> {
    return request(`/api/environments/${envId}/webhooks/${webhookId}/deliveries`)
  },
}

export const scheduledApi = {
  list(envId: string): Promise<ScheduledChange[]> {
    return request(`/api/environments/${envId}/scheduled-changes`)
  },

  listForFlag(envId: string, flagKey: string): Promise<ScheduledChange[]> {
    return request(
      `/api/environments/${envId}/flags/${encodeURIComponent(flagKey)}/scheduled-changes`,
    )
  },

  create(
    envId: string,
    flagKey: string,
    data: { scheduled_at: string; patch: Record<string, unknown> },
  ): Promise<ScheduledChange> {
    return request(
      `/api/environments/${envId}/flags/${encodeURIComponent(flagKey)}/scheduled-changes`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    )
  },

  delete(envId: string, id: string): Promise<void> {
    return request(`/api/environments/${envId}/scheduled-changes/${id}`, { method: 'DELETE' })
  },
}

export const healthApi = {
  connections(): Promise<ConnectedClient[]> {
    return request('/api/health/connections')
  },
}

export const userApi = {
  list(): Promise<ApiUser[]> {
    return request('/api/users')
  },

  create(data: { name: string; email: string; role: string; password: string }): Promise<ApiUser> {
    return request('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  remove(id: number): Promise<void> {
    return request(`/api/users/${id}`, { method: 'DELETE' })
  },
}

export interface SdkKeyInfo {
  id: number
  name: string
  prefix: string
  environment_id: string
  environment_name: string
  created_at: string
}

export interface NewKeyResponse {
  id: number
  name: string
  key: string
  prefix: string
  environment_id: string
  environment_name: string
  created_at: string
}

export const keysApi = {
  list(projectId: string): Promise<SdkKeyInfo[]> {
    return request(`/api/projects/${projectId}/keys`)
  },

  create(projectId: string, name: string, environmentId: string): Promise<NewKeyResponse> {
    return request(`/api/projects/${projectId}/keys`, {
      method: 'POST',
      body: JSON.stringify({ name, environment_id: environmentId }),
    })
  },

  revoke(projectId: string, id: number): Promise<void> {
    return request(`/api/projects/${projectId}/keys/${id}`, { method: 'DELETE' })
  },
}

export interface ProjectSummary {
  id: string
  name: string
  slug: string
  environment_count: number
  member_count: number
  created_at: string
}

export interface ProjectMemberInfo {
  user_id: number
  name: string
  email: string
  role: string
}

export const projectsApi = {
  list(): Promise<ProjectSummary[]> {
    return request('/api/projects')
  },

  create(name: string): Promise<ProjectSummary> {
    return request('/api/projects', { method: 'POST', body: JSON.stringify({ name }) })
  },

  rename(projectId: string, name: string): Promise<ProjectSummary> {
    return request(`/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
  },

  delete(projectId: string): Promise<void> {
    return request(`/api/projects/${projectId}`, { method: 'DELETE' })
  },

  listMembers(projectId: string): Promise<ProjectMemberInfo[]> {
    return request(`/api/projects/${projectId}/members`)
  },

  addMember(projectId: string, userId: number, role: string): Promise<ProjectMemberInfo> {
    return request(`/api/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, role }),
    })
  },

  updateMemberRole(projectId: string, userId: number, role: string): Promise<ProjectMemberInfo> {
    return request(`/api/projects/${projectId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
  },

  removeMember(projectId: string, userId: number): Promise<void> {
    return request(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' })
  },
}
