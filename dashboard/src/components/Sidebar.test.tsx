import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar'

const mockAuthContext = {
  logout: vi.fn(),
  session: {
    user: {
      name: 'testuser',
      role: 'admin'
    }
  }
}

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthContext,
}))

describe('Sidebar Integration', () => {
  it('renders navigation links and user profile', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )

    // Check main navigation features
    expect(screen.getByText('Checkgate')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Feature Flags')).toBeInTheDocument()
    expect(screen.getByText('Users')).toBeInTheDocument()

    // Assert the mocked user is shown
    expect(screen.getByText('testuser')).toBeInTheDocument()
  })
})
