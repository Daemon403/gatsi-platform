import { getActiveUser } from '@gatsi/domain';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { BranchesPage } from './pages/BranchesPage';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { LoginPage } from './pages/LoginPage';
import { NewOrderPage } from './pages/NewOrderPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { OperationsSummaryPage } from './pages/OperationsSummaryPage';
import { PickupPage } from './pages/PickupPage';
import { ReceiptsPage } from './pages/ReceiptsPage';
import { ServicesPage } from './pages/ServicesPage';
import { TeamPage } from './pages/TeamPage';
import { useAppStore } from './store/AppStore';

export function App() {
  const { state } = useAppStore();
  const user = getActiveUser(state);
  if (!user) return <LoginPage />;
  return <AppShell><Routes>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/orders" element={<OrdersPage />} />
    <Route path="/orders/new" element={user.role === 'customer' ? <Navigate to="/orders" /> : <NewOrderPage />} />
    <Route path="/orders/:orderId" element={<OrderDetailPage />} />
    <Route path="/customers" element={user.role === 'admin' ? <CustomersPage /> : <Navigate to="/" />} />
    <Route path="/inventory" element={user.role === 'customer' ? <Navigate to="/" /> : <InventoryPage />} />
    <Route path="/team" element={user.role === 'customer' ? <Navigate to="/" /> : <TeamPage />} />
    <Route path="/branches" element={user.role === 'admin' ? <BranchesPage /> : <Navigate to="/" />} />
    <Route path="/services" element={<ServicesPage />} />
    <Route path="/operations-summary" element={user.role === 'admin' ? <OperationsSummaryPage /> : <Navigate to="/" />} />
    <Route path="/pickup" element={user.role === 'customer' ? <PickupPage /> : <Navigate to="/" />} />
    <Route path="/receipts" element={user.role === 'customer' ? <ReceiptsPage /> : <Navigate to="/" />} />
    <Route path="*" element={<Navigate to="/" />} />
  </Routes></AppShell>;
}
