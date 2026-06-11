import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
import { ExpenseApprovalsPage } from '@/pages/ExpenseApprovals';
import { RecurringTemplatesPage } from '@/pages/RecurringTemplates';
import { TaxAuditPage } from '@/pages/TaxAudit';
import { FinanceGuruPage } from '@/pages/FinanceGuru';
import { SettingsPage } from '@/pages/Settings';
import { seedDefaultData } from '@/lib/seed';
import { pullFromSupabase } from '@/lib/storage';

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
        <Route path="/approvals" element={<ExpenseApprovalsPage />} />
        <Route path="/recurring" element={<RecurringTemplatesPage />} />
        <Route path="/tax" element={<TaxAuditPage />} />
        <Route path="/guru" element={<FinanceGuruPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  const [syncing, setSyncing] = useState(true);

  useEffect(() => {
    pullFromSupabase()
      .then(() => { seedDefaultData(); setSyncing(false); })
      .catch(() => { seedDefaultData(); setSyncing(false); });
    const interval = setInterval(() => pullFromSupabase().catch(() => {}), 30000);
    return () => clearInterval(interval);
  }, []);

  if (syncing) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#16C4BA] border-t-transparent mx-auto animate-spin mb-3" />
          <p className="text-xs text-[#666] uppercase tracking-widest">Syncing</p>
        </div>
      </div>
    );
  }

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
