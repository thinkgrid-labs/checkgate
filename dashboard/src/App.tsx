import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Setup from './pages/Setup'
import Dashboard from './pages/Dashboard'
import FlagList from './pages/FlagList'
import FlagEditor from './pages/FlagEditor'
import Users from './pages/Users'
import Settings from './pages/Settings'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, sessionLoading, isSetupComplete } = useAuth()
  if (!isSetupComplete) return <Navigate to="/setup" replace />
  // Wait for the /api/auth/me check to complete before redirecting.
  if (sessionLoading) return null
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { session, sessionLoading, isSetupComplete } = useAuth()
  if (!isSetupComplete) return <Navigate to="/setup" replace />
  if (sessionLoading) return null
  if (session) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      {/* Auth routes (no sidebar) */}
      <Route
        path="/setup"
        element={<Setup />}
      />
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />

      {/* Protected app routes */}
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/flags" element={<FlagList />} />
                <Route path="/flags/new" element={<FlagEditor />} />
                <Route path="/flags/:key/edit" element={<FlagEditor />} />
                <Route path="/users" element={<Users />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  )
}
