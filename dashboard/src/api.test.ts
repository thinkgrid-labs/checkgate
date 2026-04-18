import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api } from './api'
import type { Flag } from './types'

const ENV_ID = 'test-env-id'

describe('api functions', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const mockResponse = (data: unknown, status = 200, ok = true) => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    })
  }

  it('listFlags calls the correct endpoint', async () => {
    const mockFlags: Flag[] = [
      { key: 'test-flag', is_enabled: true, rollout_percentage: 100, description: null, rules: [] },
    ]
    mockResponse(mockFlags)

    const result = await api.listFlags(ENV_ID)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/environments/${ENV_ID}/flags`,
      expect.objectContaining({ credentials: 'same-origin' }),
    )
    expect(result).toEqual(mockFlags)
  })

  it('createFlag forms the post body properly', async () => {
    const newFlag: Flag = { key: 'new-flag', is_enabled: false, rollout_percentage: null, description: null, rules: [] }
    mockResponse(newFlag)

    await api.createFlag(ENV_ID, newFlag)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/environments/${ENV_ID}/flags`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(newFlag),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })

  it('throws an error on rejection', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: () => Promise.resolve('Invalid JSON'),
    })

    await expect(api.listFlags(ENV_ID)).rejects.toThrow('400 Invalid JSON')
  })
})
