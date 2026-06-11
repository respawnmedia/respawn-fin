import React, { useState, useEffect } from 'react';
import { CheckCircle, Circle, ChevronDown, X, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMonthlyCloseState, saveMonthlyCloseState } from '@/lib/storage';
import { getBankTransactions, getCashTransactions, getInvoices, getClients, getClientMonthlyCosts } from '@/lib/storage';
import { currentMonth, formatMonth, monthsAgo } from '@/utils/format';

interface CloseStep {
  id: string;
  label: string;
  description: string;
  route?: string;
  autoCheck?: () => boolean;
}

function buildSteps(month: string): CloseStep[] {
  const bankTxns = getBankTransactions();
  const cashTxns = getCashTransactions();
  const invoices = getInvoices();
  const clients = getClients().filter(c => c.status === 'active');
  const costs = getClientMonthlyCosts();

  return [
    {
      id: 'bank_statement',
      label: 'Bank statement uploaded',
      description: 'Upload and commit the month\'s bank PDF',
      route: '/bank',
      autoCheck: () => bankTxns.some(t => t.date.startsWith(month)),
    },
    {
      id: 'cash_transactions',
      label: 'Cash transactions entered',
      description: 'All petty cash entries for the month recorded',
      route: '/cash',
      autoCheck: () => cashTxns.some(t => t.date.startsWith(month)),
    },
    {
      id: 'invoices_sent',
      label: 'All invoices sent to clients',
      description: 'Mark invoices as Sent for all active clients',
      route: '/clients',
      autoCheck: () => {
        return clients.every(client => {
          const clientInvoices = invoices.filter(i => i.client_id === client.id && i.invoice_date.startsWith(month));
          return clientInvoices.length > 0 && clientInvoices.some(i => i.status !== 'Draft');
        });
      },
    },
    {
      id: 'cost_sheets',
      label: 'Client cost sheets filled',
      description: 'Enter actual costs for every active client',
      route: '/clients',
      autoCheck: () => clients.every(c => costs.some(cs => cs.client_id === c.id && cs.month === month)),
    },
    {
      id: 'payments_recorded',
      label: 'Client payments recorded',
      description: 'Record all payments received from clients',
      route: '/clients',
    },
    {
      id: 'bank_categories',
      label: 'Bank transactions categorised',
      description: 'Review and confirm all bank transaction categories',
      route: '/bank',
      autoCheck: () => {
        const monthTxns = bankTxns.filter(t => t.date.startsWith(month));
        if (monthTxns.length === 0) return false;
        const uncategorised = monthTxns.filter(t => !t.category_id || t.category_id === '');
        return uncategorised.length === 0;
      },
    },
    {
      id: 'gst_cash',
      label: 'GST noted on cash receipts',
      description: 'Large cash receipts should have GST recorded',
      route: '/cash',
    },
    {
      id: 'expense_approvals',
      label: 'Pending expense approvals cleared',
      description: 'Review and approve or reject pending team expense requests',
      route: '/approvals',
    },
    {
      id: 'review_insights',
      label: 'Smart questions resolved',
      description: 'Go through the bell icon and resolve or dismiss open questions',
    },
    {
      id: 'backup',
      label: 'Data backed up',
      description: 'Download an encrypted backup from Settings',
      route: '/settings',
    },
  ];
}

export function MonthlyCloseButton() {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(monthsAgo(0)); // default to current month
  const [state, setState] = useState(() => getMonthlyCloseState(monthsAgo(0)));
  const navigate = useNavigate();

  useEffect(() => {
    setState(getMonthlyCloseState(month));
  }, [month]);

  const steps = buildSteps(month);
  const autoCompleted = steps.filter(s => s.autoCheck?.()).map(s => s.id);
  const allCompleted = new Set([...state.completed_steps, ...autoCompleted]);
  const completedCount = allCompleted.size;
  const totalCount = steps.length;
  const pct = Math.round((completedCount / totalCount) * 100);
  const isClosed = !!state.closed_at;

  function toggle(id: string) {
    const newCompleted = allCompleted.has(id)
      ? state.completed_steps.filter(s => s !== id)
      : [...state.completed_steps, id];
    const newState = { ...state, completed_steps: newCompleted };
    setState(newState);
    saveMonthlyCloseState(newState);
  }

  function closeMonth() {
    const newState = { ...state, completed_steps: steps.map(s => s.id), closed_at: new Date().toISOString() };
    setState(newState);
    saveMonthlyCloseState(newState);
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors border ${
          isClosed ? 'bg-[#dcfce7] border-[#16A34A] text-[#16A34A]'
          : pct > 70 ? 'bg-[#fef3c7] border-[#F59E0B] text-[#d97706]'
          : 'border-[#e8e8e8] text-[#888] hover:border-[#16C4BA] hover:text-[#16C4BA]'
        }`}>
        <ClipboardList className="w-3.5 h-3.5" />
        Close {formatMonth(month)}
        <span className={`text-[10px] font-bold px-1 py-0.5 ${isClosed ? 'bg-[#16A34A] text-white' : 'bg-[#e8e8e8] text-[#555]'}`}>
          {isClosed ? '✓' : `${completedCount}/${totalCount}`}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 w-[400px] max-w-[95vw] bg-white border border-[#e8e8e8] shadow-xl z-50 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e8e8]">
              <div>
                <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide">Monthly Close</h3>
                <div className="flex items-center gap-2 mt-1">
                  <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                    className="text-xs border-none focus:outline-none text-[#888] bg-transparent" />
                  {/* Progress bar */}
                  <div className="flex-1 h-1.5 bg-[#f0f0f0]">
                    <div className="h-full bg-[#16C4BA] transition-all duration-300" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-[#888]">{pct}%</span>
                </div>
              </div>
              <button onClick={() => setOpen(false)}><X className="w-4 h-4 text-[#888]" /></button>
            </div>

            <div className="overflow-y-auto flex-1 py-2">
              {steps.map(step => {
                const done = allCompleted.has(step.id);
                const isAuto = autoCompleted.includes(step.id) && !state.completed_steps.includes(step.id);
                return (
                  <div key={step.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-[#fafafa] ${isClosed ? 'opacity-60' : ''}`}>
                    <button onClick={() => !isClosed && toggle(step.id)} className="mt-0.5 flex-shrink-0">
                      {done
                        ? <CheckCircle className="w-5 h-5 text-[#16A34A]" />
                        : <Circle className="w-5 h-5 text-[#ccc]" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm ${done ? 'line-through text-[#aaa]' : 'text-[#070707]'}`}>{step.label}</p>
                        {isAuto && <span className="text-[9px] bg-[#dcfce7] text-[#16A34A] px-1 py-0.5 font-medium">AUTO</span>}
                      </div>
                      <p className="text-xs text-[#aaa] mt-0.5">{step.description}</p>
                    </div>
                    {step.route && !done && (
                      <button onClick={() => { navigate(step.route!); setOpen(false); }}
                        className="text-xs text-[#16C4BA] hover:underline flex-shrink-0">
                        Go →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-3 border-t border-[#e8e8e8] flex items-center justify-between">
              {isClosed ? (
                <p className="text-xs text-[#16A34A] font-medium">
                  ✓ {formatMonth(month)} closed on {new Date(state.closed_at!).toLocaleDateString('en-IN')}
                </p>
              ) : (
                <>
                  <p className="text-xs text-[#888]">{completedCount} of {totalCount} steps done</p>
                  <button onClick={closeMonth} disabled={completedCount < totalCount}
                    className="px-4 py-2 text-xs font-medium bg-[#16C4BA] text-[#070707] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#13b0a7]">
                    Mark Month Closed
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
