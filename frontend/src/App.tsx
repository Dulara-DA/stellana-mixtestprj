import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './auth/AuthContext'
import { Shell } from './components/Shell'
import { AuditPage } from './pages/AuditPage'
import { BatchDetailsPage } from './pages/BatchDetailsPage'
import { BatchesPage } from './pages/BatchesPage'
import { CreateBatchPage } from './pages/CreateBatchPage'
import { DashboardPage } from './pages/DashboardPage'
import { LabPage } from './pages/LabPage'
import { LoginPage } from './pages/LoginPage'
import { MailboxPage } from './pages/MailboxPage'
import { MaterialsPage } from './pages/MaterialsPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { RecipeCreatePage } from './pages/RecipeCreatePage'
import { RecipeDetailsPage } from './pages/RecipeDetailsPage'
import { RecipesPage } from './pages/RecipesPage'
import { StageUpdatePage } from './pages/StageUpdatePage'
import { TraceabilityPage } from './pages/TraceabilityPage'
import { UsersPage } from './pages/UsersPage'

function ProtectedLayout() {
  const { user } = useAuth()
  return user ? <Shell /> : <Navigate to="/login" replace />
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user?.role === 'SYSTEM_ADMIN' ? children : <Navigate to="/" replace />
}

function ManagementOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user && ['MANAGER', 'SYSTEM_ADMIN'].includes(user.role) ? children : <Navigate to="/" replace />
}

function BatchCreatorOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user && ['MANAGER', 'MIXING_OFFICER', 'SYSTEM_ADMIN'].includes(user.role)
    ? children
    : <Navigate to="/" replace />
}

export default function App() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/trace/:code" element={<TraceabilityPage />} />

      <Route element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/batches" element={<BatchesPage />} />
        <Route path="/batches/new" element={<BatchCreatorOnly><CreateBatchPage /></BatchCreatorOnly>} />
        <Route path="/batches/:id" element={<BatchDetailsPage />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/recipes/new" element={<ManagementOnly><RecipeCreatePage /></ManagementOnly>} />
        <Route path="/recipes/:id" element={<RecipeDetailsPage />} />
        <Route path="/materials" element={<MaterialsPage />} />
        <Route path="/stages" element={<StageUpdatePage />} />
        <Route path="/lab" element={<LabPage />} />
        <Route path="/mailbox" element={<MailboxPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/users" element={<AdminOnly><UsersPage /></AdminOnly>} />
        <Route path="/audit" element={<ManagementOnly><AuditPage /></ManagementOnly>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
