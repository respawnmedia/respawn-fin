import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Wallet, Users, Calculator,
  MessageSquare, Settings, LogOut, Menu, ChevronRight,
  FileText, UsersRound, Receipt
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { APP_VERSION } from '@/utils/version';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/bank', label: 'Bank Transactions', icon: Building2 },
  { path: '/cash', label: 'Cash Transactions', icon: Wallet },
  { path: '/clients', label: 'Client Payments', icon: Users },
  { path: '/team', label: 'Team & Vendors', icon: UsersRound },
  { path: '/invoices', label: 'Invoice Generator', icon: Receipt },
  { path: '/tax', label: 'Tax Audit', icon: Calculator },
  { path: '/guru', label: 'Finance Guru', icon: MessageSquare },
];

interface LayoutProps { children: React.ReactNode; }

export function Layout({ children }: LayoutProps) {
  const { logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const currentPage = [...NAV_ITEMS, { path: '/settings', label: 'Settings', icon: Settings }].find(item =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  );

  return (
    <div className="flex h-screen bg-[#f7f7f5] overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-56 bg-[#070707] flex flex-col h-full transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="px-5 py-5 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#16C4BA] flex items-center justify-center flex-shrink-0">
              <span className="font-['Barlow_Condensed'] font-bold text-[#070707] text-xs">RF</span>
            </div>
            <div>
              <div className="font-['Barlow_Condensed'] font-bold text-white text-base tracking-wide uppercase leading-none">Respawn</div>
              <div className="text-[#16C4BA] text-[10px] font-medium tracking-widest uppercase">Finance</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <NavLink key={item.path} to={item.path} end={item.path === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${isActive ? 'text-white bg-[#16C4BA]/10 border-r-2 border-[#16C4BA]' : 'text-[#888] hover:text-[#ccc] hover:bg-[#111]'}`}>
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </NavLink>
          ))}
          <div className="my-3 mx-5 border-t border-[#1a1a1a]" />
          <NavLink to="/settings" onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${isActive ? 'text-white bg-[#16C4BA]/10 border-r-2 border-[#16C4BA]' : 'text-[#888] hover:text-[#ccc] hover:bg-[#111]'}`}>
            <Settings className="w-4 h-4 flex-shrink-0" />Settings
          </NavLink>
        </nav>

        <div className="p-4 border-t border-[#1a1a1a]">
          <button onClick={logout} className="flex items-center gap-3 w-full px-1 py-2 text-sm text-[#666] hover:text-[#DC2626] transition-colors">
            <LogOut className="w-4 h-4" />Sign out
          </button>
          <p className="text-[#333] text-[10px] mt-2 font-mono">v{APP_VERSION}</p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-[#e8e8e8] px-5 py-3 flex items-center gap-4 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-[#666] hover:text-[#070707]">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[#888]">Respawn Finance</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#ccc]" />
            <span className="font-medium text-[#070707]">{currentPage?.label || 'App'}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-[#888] hidden sm:block">
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <div className="w-7 h-7 bg-[#16C4BA] flex items-center justify-center">
              <span className="text-xs font-bold text-[#070707]">RF</span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="font-['Barlow_Condensed'] text-3xl font-bold text-[#070707] uppercase tracking-wide">{title}</h1>
        {subtitle && <p className="text-sm text-[#888] mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
