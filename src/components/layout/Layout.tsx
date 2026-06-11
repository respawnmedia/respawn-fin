import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Wallet, Users, Calculator,
  MessageSquare, Settings, LogOut, Menu, ChevronRight,
  UsersRound, Receipt, RefreshCw, CheckSquare, X
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { APP_VERSION } from '@/utils/version';
import { InsightsTray } from '@/components/ui/InsightsTray';
import { MonthlyCloseButton } from '@/components/ui/MonthlyClose';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/bank', label: 'Bank Transactions', icon: Building2 },
  { path: '/cash', label: 'Cash Transactions', icon: Wallet },
  { path: '/clients', label: 'Client Payments', icon: Users },
  { path: '/team', label: 'Team & Vendors', icon: UsersRound },
  { path: '/invoices', label: 'Invoice Generator', icon: Receipt },
  { path: '/approvals', label: 'Expense Approvals', icon: CheckSquare },
  { path: '/recurring', label: 'Recurring & Reminders', icon: RefreshCw },
  { path: '/tax', label: 'Tax Audit', icon: Calculator },
  { path: '/guru', label: 'Finance Guru', icon: MessageSquare },
];

interface LayoutProps { children: React.ReactNode; }

export function Layout({ children }: LayoutProps) {
  const { logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const allNavItems = [...NAV_ITEMS, { path: '/settings', label: 'Settings', icon: Settings }];
  const currentPage = allNavItems.find(item =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  );

  return (
    <div className="flex h-screen bg-[#f7f7f5] overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-60 bg-[#070707] flex flex-col h-full
        transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo + close button on mobile */}
        <div className="px-5 py-4 border-b border-[#1a1a1a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#16C4BA] flex items-center justify-center flex-shrink-0">
              <span className="font-['Barlow_Condensed'] font-bold text-[#070707] text-xs">RF</span>
            </div>
            <div>
              <div className="font-['Barlow_Condensed'] font-bold text-white text-sm tracking-wide uppercase leading-none">Respawn</div>
              <div className="text-[#16C4BA] text-[9px] font-medium tracking-widest uppercase">Finance</div>
            </div>
          </div>
          {/* Close button visible on mobile only */}
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-[#666] hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-5 py-2.5 text-sm transition-colors
                ${isActive
                  ? 'text-white bg-[#16C4BA]/10 border-r-2 border-[#16C4BA]'
                  : 'text-[#666] hover:text-[#ccc] hover:bg-[#111]'
                }
              `}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}

          <div className="my-2 mx-5 border-t border-[#1a1a1a]" />

          <NavLink
            to="/settings"
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => `
              flex items-center gap-3 px-5 py-2.5 text-sm transition-colors
              ${isActive ? 'text-white bg-[#16C4BA]/10 border-r-2 border-[#16C4BA]' : 'text-[#666] hover:text-[#ccc] hover:bg-[#111]'}
            `}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            <span>Settings</span>
          </NavLink>
        </nav>

        {/* Sign out + version */}
        <div className="p-4 border-t border-[#1a1a1a]">
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-1 py-2 text-sm text-[#555] hover:text-[#DC2626] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
          <p className="text-[#2a2a2a] text-[10px] mt-1.5 font-mono pl-1">v{APP_VERSION}</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-[#e8e8e8] flex-shrink-0 h-12 flex items-center px-4 gap-2">
          {/* Left: breadcrumb */}
          <div className="flex items-center gap-2 text-sm flex-1 min-w-0">
            <span className="text-[#aaa] hidden sm:block text-xs">RF</span>
            <ChevronRight className="w-3 h-3 text-[#ddd] hidden sm:block" />
            <span className="font-medium text-[#070707] text-sm truncate">{currentPage?.label || 'App'}</span>
          </div>

          {/* Right: actions + hamburger LAST (top-right) */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <MonthlyCloseButton />
            <InsightsTray />
            <span className="text-[10px] text-[#ccc] hidden sm:block mx-1">
              {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
            {/* Hamburger — top-right on mobile */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden ml-1 flex items-center justify-center w-9 h-9 text-[#555] hover:text-[#070707] hover:bg-[#f0f0f0] transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: {
  title: string; subtitle?: string; actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-5 gap-3">
      <div className="min-w-0">
        <h1 className="font-['Barlow_Condensed'] text-2xl lg:text-3xl font-bold text-[#070707] uppercase tracking-wide leading-tight">
          {title}
        </h1>
        {subtitle && <p className="text-xs lg:text-sm text-[#888] mt-0.5 leading-snug">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
