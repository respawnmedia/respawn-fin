import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Wallet, Clock, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { PageHeader } from '@/components/layout/Layout';
import { MetricCard, Card } from '@/components/ui/Card';
import { Badge, InvoiceStatusBadge } from '@/components/ui/Badge';
import {
  getBankTransactions, getCashTransactions, getInvoices,
  getClients, computeCashBalance
} from '@/lib/storage';
import { formatCurrency, formatDate, monthsAgo, currentMonth } from '@/utils/format';

const CHART_COLORS = ['#16C4BA', '#DC2626', '#F59E0B', '#2563eb', '#7c3aed', '#16A34A'];

export function Dashboard() {
  const bankTxns = getBankTransactions();
  const cashTxns = getCashTransactions();
  const invoices = getInvoices();
  const clients = getClients();
  const cashBalance = computeCashBalance();

  const thisMonth = currentMonth();

  // Monthly metrics
  const metrics = useMemo(() => {
    const thisMonthBank = bankTxns.filter(t => t.date.startsWith(thisMonth));
    const thisMonthCash = cashTxns.filter(t => t.date.startsWith(thisMonth));

    const bankInflow = thisMonthBank.reduce((s, t) => s + t.credit, 0);
    const bankOutflow = thisMonthBank.reduce((s, t) => s + t.debit, 0);
    const cashIn = thisMonthCash.filter(t => t.type === 'Cash In').reduce((s, t) => s + t.amount, 0);
    const cashOut = thisMonthCash.filter(t => t.type === 'Cash Out').reduce((s, t) => s + t.amount, 0);

    const totalInflow = bankInflow + cashIn;
    const totalOutflow = bankOutflow + cashOut;
    const net = totalInflow - totalOutflow;

    // Last bank balance
    const sorted = [...bankTxns].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastBankBalance = sorted[0]?.balance || 0;

    const pendingInvoices = invoices.filter(i => i.status === 'Sent' || i.status === 'Partially Paid' || i.status === 'Overdue');
    const pendingAmount = pendingInvoices.reduce((s, i) => s + i.total, 0);

    return { totalInflow, totalOutflow, net, lastBankBalance, pendingAmount, cashBalance };
  }, [bankTxns, cashTxns, invoices, cashBalance, thisMonth]);

  // 6-month cash flow data
  const cashFlowData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const month = monthsAgo(5 - i);
      const mBank = bankTxns.filter(t => t.date.startsWith(month));
      const mCash = cashTxns.filter(t => t.date.startsWith(month));
      const inflow = mBank.reduce((s, t) => s + t.credit, 0) + mCash.filter(t => t.type === 'Cash In').reduce((s, t) => s + t.amount, 0);
      const outflow = mBank.reduce((s, t) => s + t.debit, 0) + mCash.filter(t => t.type === 'Cash Out').reduce((s, t) => s + t.amount, 0);
      const [year, m] = month.split('-');
      const label = new Date(parseInt(year), parseInt(m) - 1).toLocaleDateString('en-IN', { month: 'short' });
      return { month: label, inflow, outflow, net: inflow - outflow };
    });
  }, [bankTxns, cashTxns]);

  // Category pie data
  const categoryData = useMemo(() => {
    const thisMonthBank = bankTxns.filter(t => t.date.startsWith(thisMonth) && t.debit > 0);
    const thisMonthCash = cashTxns.filter(t => t.date.startsWith(thisMonth) && t.type === 'Cash Out');
    const catMap: Record<string, number> = {};
    thisMonthBank.forEach(t => { catMap[t.category_id] = (catMap[t.category_id] || 0) + t.debit; });
    thisMonthCash.forEach(t => { catMap[t.category_id] = (catMap[t.category_id] || 0) + t.amount; });
    return Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [bankTxns, cashTxns, thisMonth]);

  // Recent transactions (combined, last 10)
  const recentActivity = useMemo(() => {
    const bank = bankTxns.map(t => ({
      id: t.id, date: t.date, narration: t.narration,
      amount: t.credit > 0 ? t.credit : -t.debit,
      type: 'bank' as const,
    }));
    const cash = cashTxns.map(t => ({
      id: t.id, date: t.date, narration: t.description || t.party,
      amount: t.type === 'Cash In' ? t.amount : -t.amount,
      type: 'cash' as const,
    }));
    return [...bank, ...cash]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [bankTxns, cashTxns]);

  // Overdue invoices
  const overdueInvoices = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return invoices
      .filter(i => (i.status === 'Sent' || i.status === 'Partially Paid') && i.due_date < today)
      .map(inv => ({
        ...inv,
        client: clients.find(c => c.id === inv.client_id),
        daysOverdue: Math.floor((new Date(today).getTime() - new Date(inv.due_date).getTime()) / 86400000),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [invoices, clients]);

  return (
    <div className="p-6 max-w-[1400px]">
      <PageHeader
        title="Dashboard"
        subtitle={`Financial overview · ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`}
      />

      {/* Alerts */}
      {overdueInvoices.length > 0 && (
        <div className="mb-5 bg-[#fef3c7] border border-[#F59E0B] px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-[#d97706] flex-shrink-0" />
          <span className="text-sm text-[#92400e]">
            {overdueInvoices.length} overdue invoice{overdueInvoices.length > 1 ? 's' : ''} — {formatCurrency(overdueInvoices.reduce((s, i) => s + i.total, 0))} pending collection
          </span>
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <MetricCard
          label="Total Inflow"
          value={formatCurrency(metrics.totalInflow, true)}
          sub="This month"
          accent="green"
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <MetricCard
          label="Total Outflow"
          value={formatCurrency(metrics.totalOutflow, true)}
          sub="This month"
          accent="red"
          icon={<TrendingDown className="w-4 h-4" />}
        />
        <MetricCard
          label="Net Position"
          value={formatCurrency(metrics.net, true)}
          sub="Inflow minus outflow"
          accent={metrics.net >= 0 ? 'green' : 'red'}
        />
        <MetricCard
          label="Cash in Hand"
          value={formatCurrency(metrics.cashBalance, true)}
          sub="Running balance"
          accent="teal"
          icon={<Wallet className="w-4 h-4" />}
        />
        <MetricCard
          label="Bank Balance"
          value={formatCurrency(metrics.lastBankBalance, true)}
          sub="Last statement"
        />
        <MetricCard
          label="Pending Payments"
          value={formatCurrency(metrics.pendingAmount, true)}
          sub="From clients"
          accent="amber"
          icon={<Clock className="w-4 h-4" />}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Cash flow line chart */}
        <Card className="lg:col-span-2">
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
            Cash Flow — Last 6 Months
          </h3>
          {cashFlowData.some(d => d.inflow > 0 || d.outflow > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cashFlowData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false}
                  tickFormatter={(v: unknown) => formatCurrency(Number(v), true)} width={60} />
                <Tooltip
                  formatter={(value: unknown) => formatCurrency(Number(value))}
                  contentStyle={{ border: '1px solid #e8e8e8', borderRadius: 0, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="inflow" stroke="#16A34A" strokeWidth={2} dot={false} name="Inflow" />
                <Line type="monotone" dataKey="outflow" stroke="#DC2626" strokeWidth={2} dot={false} name="Outflow" />
                <Line type="monotone" dataKey="net" stroke="#16C4BA" strokeWidth={2} dot={false} name="Net" strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-[#888]">
              No transaction data yet. Add bank or cash transactions to see the chart.
            </div>
          )}
          <div className="flex gap-4 mt-3">
            {[{ color: '#16A34A', label: 'Inflow' }, { color: '#DC2626', label: 'Outflow' }, { color: '#16C4BA', label: 'Net' }].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-3 h-0.5" style={{ background: l.color }} />
                <span className="text-xs text-[#888]">{l.label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Expense breakdown pie */}
        <Card>
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
            Expense Breakdown
          </h3>
          {categoryData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={70}
                    dataKey="value" stroke="none">
                    {categoryData.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => formatCurrency(Number(v))}
                    contentStyle={{ border: '1px solid #e8e8e8', borderRadius: 0, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {categoryData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-xs text-[#555] truncate max-w-[120px]">{d.name}</span>
                    </div>
                    <span className="text-xs font-medium text-[#333] tabular-nums">{formatCurrency(d.value, true)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[160px] flex items-center justify-center text-sm text-[#888]">
              No expenses this month yet.
            </div>
          )}
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent activity */}
        <Card>
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
            Recent Activity
          </h3>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-[#888] py-6 text-center">No transactions yet.</p>
          ) : (
            <div className="space-y-0">
              {recentActivity.map(txn => (
                <div key={txn.id} className="flex items-center justify-between py-2.5 border-b border-[#f0f0f0] last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-7 h-7 flex items-center justify-center flex-shrink-0 ${txn.amount > 0 ? 'bg-[#dcfce7]' : 'bg-[#fee2e2]'}`}>
                      {txn.amount > 0
                        ? <ArrowUpRight className="w-3.5 h-3.5 text-[#16A34A]" />
                        : <ArrowDownRight className="w-3.5 h-3.5 text-[#DC2626]" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-[#070707] truncate">{txn.narration}</p>
                      <p className="text-xs text-[#888]">{formatDate(txn.date)} · <Badge variant="gray">{txn.type}</Badge></p>
                    </div>
                  </div>
                  <span className={`text-sm font-medium tabular-nums ml-3 flex-shrink-0 ${txn.amount > 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                    {txn.amount > 0 ? '+' : ''}{formatCurrency(txn.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Client payment status */}
        <Card>
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
            Client Payment Status
          </h3>
          {invoices.length === 0 ? (
            <p className="text-sm text-[#888] py-6 text-center">No invoices yet. Add clients and invoices to track payments.</p>
          ) : (
            <div className="space-y-0">
              {invoices.slice(0, 8).map(inv => {
                const client = clients.find(c => c.id === inv.client_id);
                const daysOverdue = inv.status === 'Overdue' || (inv.due_date < new Date().toISOString().split('T')[0] && inv.status === 'Sent')
                  ? Math.floor((new Date().getTime() - new Date(inv.due_date).getTime()) / 86400000)
                  : null;
                return (
                  <div key={inv.id} className="flex items-center justify-between py-2.5 border-b border-[#f0f0f0] last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#070707] truncate">{client?.name || 'Unknown Client'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[#888]">{inv.invoice_no}</span>
                        {daysOverdue !== null && daysOverdue > 0 && (
                          <span className="text-xs text-[#DC2626]">{daysOverdue}d overdue</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      <span className="text-sm font-medium tabular-nums">{formatCurrency(inv.total)}</span>
                      <InvoiceStatusBadge status={inv.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
