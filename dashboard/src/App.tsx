import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { ProjectProvider } from './context/ProjectContext'
import { EnvironmentProvider } from './context/EnvironmentContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Setup from './pages/Setup'
import AuditLog from './pages/AuditLog'
import Dashboard from './pages/Dashboard'
import FlagList from './pages/FlagList'
import FlagEditor from './pages/FlagEditor'
import Scheduled from './pages/Scheduled'
import SdkHealth from './pages/SdkHealth'
import Segments from './pages/Segments'
import Users from './pages/Users'
import Settings from './pages/Settings'
import Environments from './pages/Environments'
import Impressions from './pages/Impressions'
import Projects from './pages/Projects'
import ProjectSettings from './pages/ProjectSettings'
import Webhooks from './pages/Webhooks'

function RequireAuth({ children }: { readonly children: React.ReactNode }) {
  const { session, sessionLoading, isSetupComplete } = useAuth()
  if (!isSetupComplete) return <Navigate to="/setup" replace />
  if (sessionLoading) return null
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicOnly({ children }: { readonly children: React.ReactNode }) {
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
      <Route path="/setup" element={<Setup />} />
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
            <ProjectProvider>
              <EnvironmentProvider>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/flags" element={<FlagList />} />
                    <Route path="/flags/new" element={<FlagEditor />} />
                    <Route path="/flags/:key/edit" element={<FlagEditor />} />
                    <Route path="/segments" element={<Segments />} />
                    <Route path="/schedule" element={<Scheduled />} />
                    <Route path="/impressions" element={<Impressions />} />
                    <Route path="/audit" element={<AuditLog />} />
                    <Route path="/sdk-health" element={<SdkHealth />} />
                    <Route path="/webhooks" element={<Webhooks />} />
                    <Route path="/environments" element={<Environments />} />
                    <Route path="/projects" element={<Projects />} />
                    <Route path="/projects/:projectId" element={<ProjectSettings />} />
                    <Route path="/users" element={<Users />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Layout>
              </EnvironmentProvider>
            </ProjectProvider>
          </RequireAuth>
        }
      />
    </Routes>
  )
}
