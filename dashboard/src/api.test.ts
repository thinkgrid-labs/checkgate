import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api } from './api'
import type { Flag } from './types'

describe('api functions', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    // Clear out fetch mocks
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const mockResponse = (data: any, status = 200, ok = true) => {
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

    const result = await api.listFlags()
    
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/flags', expect.objectContaining({
      credentials: 'same-origin',
    }))
    expect(result).toEqual(mockFlags)
  })

  it('createFlag forms the post body properly', async () => {
    const newFlag: Flag = { key: 'new-flag', is_enabled: false, rollout_percentage: null, description: null, rules: [] }
    mockResponse(newFlag)

    await api.createFlag(newFlag)
    
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/flags', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(newFlag),
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
    }))
  })

  it('throws an error on rejection', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: () => Promise.resolve('Invalid JSON'),
    })

    await expect(api.listFlags()).rejects.toThrow('400 Invalid JSON')
  })
})
