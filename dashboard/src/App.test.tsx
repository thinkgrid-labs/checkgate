import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { useAuth } from './context/AuthContext'
import { api } from './api'

// Mock the AuthContext completely
vi.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }: any) => <div>{children}</div>,
  useAuth: vi.fn(),
}))

vi.mock('./api', () => ({
  api: {
    listFlags: vi.fn(),
  }
}))

const mockUseAuth = vi.mocked(useAuth)
const mockApiListFlags = vi.mocked(api.listFlags)

describe('App Router Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiListFlags.mockResolvedValue([])
  })

  it('redirects to setup when setup is not complete', () => {
    mockUseAuth.mockReturnValue({
      session: null,
      sessionLoading: false,
      isSetupComplete: false,
      login: vi.fn(),
      logout: vi.fn(),
    } as any)

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )

    expect(screen.getByText(/Welcome to Checkgate/i)).toBeInTheDocument()
  })

  it('redirects to login when no session is present', () => {
    mockUseAuth.mockReturnValue({
      session: null,
      sessionLoading: false,
      isSetupComplete: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as any)

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )

    expect(screen.getByText(/Welcome back/i)).toBeInTheDocument()
  })

  it('allows access to dashboard when authenticated', async () => {
    mockUseAuth.mockReturnValue({
      session: { 
        user: { name: 'testuser', role: 'admin' },
        token: 'xxx'
      },
      sessionLoading: false,
      isSetupComplete: true,
      login: vi.fn(),
      logout: vi.fn(),
    } as any)

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Total flags/i)).toBeInTheDocument()
    })
  })
})
