import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { Layout } from '@/components/layout/Layout';
import { LoginPage } from '@/pages/LoginPage';
import { Dashboard } from '@/pages/Dashboard';
import { BankTransactionsPage } from '@/pages/BankTransactions';
import { CashTransactionsPage } from '@/pages/CashTransactions';
import { ClientPaymentsPage } from '@/pages/ClientPayments';
import { TeamMembersPage } from '@/pages/TeamMembers';
import { InvoiceGeneratorPage } from '@/pages/InvoiceGenerator';
import { TaxAuditPage } from '@/pages/TaxAudit';
import { FinanceGuruPage } from '@/pages/FinanceGuru';
import { SettingsPage } from '@/pages/Settings';
import { seedDefaultData } from '@/lib/seed';

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <LoginPage />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/bank" element={<BankTransactionsPage />} />
        <Route path="/cash" element={<CashTransactionsPage />} />
        <Route path="/clients" element={<ClientPaymentsPage />} />
        <Route path="/team" element={<TeamMembersPage />} />
        <Route path="/invoices" element={<InvoiceGeneratorPage />} />
        <Route path="/tax" element={<TaxAuditPage />} />
        <Route path="/guru" element={<FinanceGuruPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  useEffect(() => { seedDefaultData(); }, []);
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
