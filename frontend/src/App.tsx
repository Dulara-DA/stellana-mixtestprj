import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { Shell } from './components/Shell'
import { AuditPage } from './pages/AuditPage'
import { BatchDetailsPage } from './pages/BatchDetailsPage'
import { BatchesPage } from './pages/BatchesPage'
import { BlankingDashboardPage } from './pages/BlankingDashboardPage'
import { BlankingProductionPage } from './pages/BlankingProductionPage'
import { BlankReturnsPage } from './pages/BlankReturnsPage'
import { CompoundStockPage } from './pages/CompoundStockPage'
import { CreateBatchPage } from './pages/CreateBatchPage'
import { DashboardPage } from './pages/DashboardPage'
import { LabPage } from './pages/LabPage'
import { LoginPage } from './pages/LoginPage'
import { MailboxPage } from './pages/MailboxPage'
import { MaterialsPage } from './pages/MaterialsPage'
import { MouldingDashboardPage } from './pages/MouldingDashboardPage'
import { MouldingProductionPage } from './pages/MouldingProductionPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { ProductionManagerPage } from './pages/ProductionManagerPage'
import { ReceivingHistoryPage } from './pages/ReceivingHistoryPage'
import { RecipeCreatePage } from './pages/RecipeCreatePage'
import { RecipeDetailsPage } from './pages/RecipeDetailsPage'
import { RecipesPage } from './pages/RecipesPage'
import { SectionSelectionPage } from './pages/SectionSelectionPage'
import { ShortagesPage } from './pages/ShortagesPage'
import { StageUpdatePage } from './pages/StageUpdatePage'
import { TraceabilityPage } from './pages/TraceabilityPage'
import { UsersPage } from './pages/UsersPage'
import type { Role } from './types'

function ProtectedLayout() {
  const { user } = useAuth()
  return user ? <Shell /> : <Navigate to="/login" replace />
}

function RequireLogin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

function RequireRoles({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  return user && roles.includes(user.role) ? children : <Navigate to="/" replace />
}

const management: Role[] = ['MANAGER', 'SYSTEM_ADMIN']
const mixing: Role[] = ['MANAGER', 'SYSTEM_ADMIN', 'MIXING_OFFICER', 'STORES_OFFICER', 'LAB_OFFICER']
const blanking: Role[] = ['MANAGER', 'SYSTEM_ADMIN', 'BLANKING_OPERATOR', 'BLANKING_SUPERVISOR']
const moulding: Role[] = ['MANAGER', 'SYSTEM_ADMIN', 'MOULDING_OPERATOR', 'MOULDING_SUPERVISOR']
const downstream: Role[] = [...new Set([...blanking, ...moulding])]

export default function App() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/trace/:code" element={<TraceabilityPage />} />
      <Route path="/" element={<RequireLogin><SectionSelectionPage /></RequireLogin>} />

      <Route element={<ProtectedLayout />}>
        <Route path="/mixing" element={<RequireRoles roles={mixing}><DashboardPage /></RequireRoles>} />
        <Route path="/batches" element={<RequireRoles roles={mixing}><BatchesPage /></RequireRoles>} />
        <Route path="/batches/new" element={<RequireRoles roles={['MANAGER', 'MIXING_OFFICER', 'SYSTEM_ADMIN']}><CreateBatchPage /></RequireRoles>} />
        <Route path="/batches/:id" element={<RequireRoles roles={mixing}><BatchDetailsPage /></RequireRoles>} />
        <Route path="/recipes" element={<RequireRoles roles={mixing}><RecipesPage /></RequireRoles>} />
        <Route path="/recipes/new" element={<RequireRoles roles={management}><RecipeCreatePage /></RequireRoles>} />
        <Route path="/recipes/:id" element={<RequireRoles roles={mixing}><RecipeDetailsPage /></RequireRoles>} />
        <Route path="/materials" element={<RequireRoles roles={mixing}><MaterialsPage /></RequireRoles>} />
        <Route path="/stages" element={<RequireRoles roles={mixing}><StageUpdatePage /></RequireRoles>} />
        <Route path="/lab" element={<RequireRoles roles={mixing}><LabPage /></RequireRoles>} />
        <Route path="/mailbox" element={<RequireRoles roles={mixing}><MailboxPage /></RequireRoles>} />
        <Route path="/notifications" element={<RequireRoles roles={mixing}><NotificationsPage /></RequireRoles>} />

        <Route path="/blanking" element={<RequireRoles roles={blanking}><BlankingDashboardPage /></RequireRoles>} />
        <Route path="/blanking/stock" element={<RequireRoles roles={blanking}><CompoundStockPage /></RequireRoles>} />
        <Route path="/blanking/batches" element={<RequireRoles roles={blanking}><BlankingProductionPage /></RequireRoles>} />
        <Route path="/blanking/carts" element={<RequireRoles roles={blanking}><Navigate to="/blanking/batches" replace /></RequireRoles>} />
        <Route path="/blanking/returns" element={<RequireRoles roles={downstream}><BlankReturnsPage /></RequireRoles>} />
        <Route path="/blanking/moulding" element={<RequireRoles roles={blanking}><MouldingDashboardPage /></RequireRoles>} />
        <Route path="/moulding" element={<RequireRoles roles={moulding}><MouldingDashboardPage /></RequireRoles>} />
        <Route path="/moulding/production" element={<RequireRoles roles={moulding}><MouldingProductionPage /></RequireRoles>} />
        <Route path="/moulding/receipts" element={<RequireRoles roles={moulding}><ReceivingHistoryPage /></RequireRoles>} />
        <Route path="/moulding/returns" element={<RequireRoles roles={downstream}><BlankReturnsPage /></RequireRoles>} />
        <Route path="/shortages" element={<RequireRoles roles={downstream}><ShortagesPage /></RequireRoles>} />
        <Route path="/production-manager" element={<RequireRoles roles={management}><ProductionManagerPage /></RequireRoles>} />

        <Route path="/users" element={<RequireRoles roles={['SYSTEM_ADMIN']}><UsersPage /></RequireRoles>} />
        <Route path="/audit" element={<RequireRoles roles={management}><AuditPage /></RequireRoles>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
