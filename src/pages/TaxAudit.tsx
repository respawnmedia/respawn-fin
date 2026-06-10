import React, { useMemo, useState } from 'react';
import { AlertTriangle, Calendar, Download } from 'lucide-react';
import { PageHeader } from '@/components/layout/Layout';
import { Card, MetricCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  getBankTransactions, getCashTransactions, getInvoices,
  getCategories, getTaxSettings
} from '@/lib/storage';
import { formatCurrency, formatMonth, currentMonth, monthsAgo } from '@/utils/format';

interface TaxDeadline {
  name: string;
  dueDay: number;
  description: string;
}

const TAX_DEADLINES: TaxDeadline[] = [
  { name: 'GSTR-1', dueDay: 11, description: 'Outward supplies — file by 11th' },
  { name: 'GSTR-3B', dueDay: 20, description: 'GST summary return — file by 20th' },
  { name: 'TDS Deposit', dueDay: 7, description: 'TDS deducted previous month — deposit by 7th' },
];

const ADVANCE_TAX_DATES = [
  { quarter: 'Q1', date: 'June 15', percentage: 15 },
  { quarter: 'Q2', date: 'September 15', percentage: 45 },
  { quarter: 'Q3', date: 'December 15', percentage: 75 },
  { quarter: 'Q4', date: 'March 15', percentage: 100 },
];

export function TaxAuditPage() {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());

  const taxSettings = getTaxSettings();
  const categories = getCategories();
  const bankTxns = getBankTransactions();
  const cashTxns = getCashTransactions();
  const invoices = getInvoices();

  // Find income/expense category ids
  const incomeCategories = new Set(categories.filter(c => c.type === 'income').map(c => c.id));
  const expenseCategories = new Set(categories.filter(c => c.type === 'expense').map(c => c.id));
  // GST-eligible expense categories
  const gstEligibleCategories = new Set(
    categories.filter(c => ['Software & Tools', 'Professional Fees', 'Marketing & Ads', 'Equipment', 'Office Rent'].includes(c.name)).map(c => c.id)
  );

  const taxCalc = useMemo(() => {
    const gstRate = (taxSettings?.gst_rate || 18) / 100;

    // Invoices raised this month
    const monthInvoices = invoices.filter(i => i.invoice_date.startsWith(selectedMonth));
    const gstOut = monthInvoices.reduce((s, i) => s + i.gst_amount, 0);
    const grossRevenue = monthInvoices.reduce((s, i) => s + i.amount, 0);

    // GST input credit from eligible expenses (bank)
    const bankExpenses = bankTxns.filter(t => t.date.startsWith(selectedMonth) && t.debit > 0 && gstEligibleCategories.has(t.category_id));
    const cashExpenses = cashTxns.filter(t => t.date.startsWith(selectedMonth) && t.type === 'Cash Out' && gstEligibleCategories.has(t.category_id));
    const eligibleExpenses = bankExpenses.reduce((s, t) => s + t.debit, 0) + cashExpenses.reduce((s, t) => s + t.amount, 0);
    const gstIn = eligibleExpenses * gstRate; // Assuming prices are inclusive
    const gstNet = gstOut - gstIn;

    // TDS receivable: clients typically deduct 2% (194J/194C) on payments
    // Estimate from bank credits that are client payments
    const clientPaymentTxns = bankTxns.filter(t => t.date.startsWith(selectedMonth) && t.credit > 0 && t.category_id === categories.find(c => c.name === 'Client Payment In')?.id);
    const tdsReceivable = clientPaymentTxns.reduce((s, t) => s + t.credit * 0.02, 0);

    // TDS payable: deduct on professional payments above threshold
    const profFees = bankTxns.filter(t => t.date.startsWith(selectedMonth) && t.debit > 0 && categories.find(c => c.id === t.category_id)?.name === 'Professional Fees');
    const profFeesTotal = profFees.reduce((s, t) => s + t.debit, 0);
    const tdsPayable = profFeesTotal > 30000 ? profFeesTotal * 0.1 : 0;

    // Total expenses this month
    const totalExpenses = bankTxns.filter(t => t.date.startsWith(selectedMonth) && t.debit > 0 && expenseCategories.has(t.category_id)).reduce((s, t) => s + t.debit, 0)
      + cashTxns.filter(t => t.date.startsWith(selectedMonth) && t.type === 'Cash Out').reduce((s, t) => s + t.amount, 0);

    const netProfit = grossRevenue - totalExpenses;

    // YTD profit for advance tax
    const ytdMonths: string[] = [];
    for (let i = 0; i < 12; i++) {
      const m = monthsAgo(i);
      if (m >= `${new Date().getFullYear()}-04`) ytdMonths.push(m);
    }
    const ytdRevenue = ytdMonths.reduce((s, m) => s + invoices.filter(i => i.invoice_date.startsWith(m)).reduce((ss, i) => ss + i.amount, 0), 0);
    const ytdExpenses = ytdMonths.reduce((s, m) => s + bankTxns.filter(t => t.date.startsWith(m) && t.debit > 0 && expenseCategories.has(t.category_id)).reduce((ss, t) => ss + t.debit, 0), 0);
    const ytdProfit = ytdRevenue - ytdExpenses;
    const advanceTaxEst = Math.max(0, ytdProfit * 0.26); // Rough 26% effective rate estimate

    // Professional tax (Tamil Nadu) - ₹200/month per employee earning above ₹21K
    const profTax = 200 * 11; // Approximate for ~11 team members

    return { gstOut, gstIn, gstNet, tdsReceivable, tdsPayable, advanceTaxEst, netProfit, grossRevenue, totalExpenses, profTax, eligibleExpenses };
  }, [selectedMonth, invoices, bankTxns, cashTxns, categories, taxSettings]);

  // Days until next deadline
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  function daysUntilDeadline(day: number): number {
    const deadline = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day);
    return Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
  }

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const m = monthsAgo(11 - i);
    return { value: m, label: formatMonth(m) };
  });

  return (
    <div className="p-4 lg:p-6 max-w-[1100px]">
      <PageHeader
        title="Tax Audit"
        subtitle="Monthly tax estimates for Respawn Media. Always verify with your CA."
      />

      {/* Disclaimer */}
      <div className="mb-5 bg-[#fef3c7] border border-[#F59E0B] px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-[#d97706] flex-shrink-0 mt-0.5" />
        <p className="text-sm text-[#92400e]">
          These are estimates based on recorded transactions — <strong>verify all figures with your CA before filing.</strong> Tax rules change; this tool does not account for all edge cases.
        </p>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm text-[#555]">Viewing:</span>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="px-3 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]"
        >
          {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* GST Summary */}
        <Card>
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
            GST Summary — {formatMonth(selectedMonth)}
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-[#f0f0f0]">
              <div>
                <p className="text-sm text-[#070707]">GST Output Liability</p>
                <p className="text-xs text-[#888]">18% on {formatCurrency(invoices.filter(i => i.invoice_date.startsWith(selectedMonth)).reduce((s, i) => s + i.amount, 0))} invoiced</p>
              </div>
              <span className="text-sm font-medium tabular-nums text-[#DC2626]">{formatCurrency(taxCalc.gstOut)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#f0f0f0]">
              <div>
                <p className="text-sm text-[#070707]">GST Input Credit</p>
                <p className="text-xs text-[#888]">Eligible expenses: {formatCurrency(taxCalc.eligibleExpenses)}</p>
              </div>
              <span className="text-sm font-medium tabular-nums text-[#16A34A]">{formatCurrency(taxCalc.gstIn)}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <p className="text-sm font-bold text-[#070707]">Net GST Payable</p>
              <span className={`text-lg font-bold tabular-nums font-['Barlow_Condensed'] ${taxCalc.gstNet > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>
                {formatCurrency(taxCalc.gstNet)}
              </span>
            </div>
            <div className="bg-[#f7f7f5] px-3 py-2 mt-2">
              <p className="text-xs text-[#666]">
                File <strong>GSTR-1</strong> by 11th · <strong>GSTR-3B</strong> by 20th of next month
              </p>
            </div>
          </div>
        </Card>

        {/* TDS Summary */}
        <Card>
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
            TDS Summary — {formatMonth(selectedMonth)}
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-[#f0f0f0]">
              <div>
                <p className="text-sm text-[#070707]">TDS Receivable</p>
                <p className="text-xs text-[#888]">2% clients deduct on payments to you (est.)</p>
              </div>
              <span className="text-sm font-medium tabular-nums text-[#16A34A]">{formatCurrency(taxCalc.tdsReceivable)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#f0f0f0]">
              <div>
                <p className="text-sm text-[#070707]">TDS Payable</p>
                <p className="text-xs text-[#888]">10% on professional fees &gt;₹30K (u/s 194J)</p>
              </div>
              <span className="text-sm font-medium tabular-nums text-[#DC2626]">{formatCurrency(taxCalc.tdsPayable)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#f0f0f0]">
              <div>
                <p className="text-sm text-[#070707]">Professional Tax (TN)</p>
                <p className="text-xs text-[#888]">~₹200/employee/month above ₹21K</p>
              </div>
              <span className="text-sm font-medium tabular-nums">{formatCurrency(taxCalc.profTax)}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <div>
                <p className="text-sm text-[#070707]">Advance Tax Estimate (YTD)</p>
                <p className="text-xs text-[#888]">~26% of YTD profit — check with CA</p>
              </div>
              <span className="text-sm font-medium tabular-nums">{formatCurrency(taxCalc.advanceTaxEst)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* P&L Summary */}
      <Card className="mb-6">
        <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
          P&L Summary — {formatMonth(selectedMonth)}
        </h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-[#888] uppercase tracking-wide mb-1">Gross Revenue</p>
            <p className="font-['Barlow_Condensed'] text-2xl font-bold text-[#16A34A]">{formatCurrency(taxCalc.grossRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-[#888] uppercase tracking-wide mb-1">Total Expenses</p>
            <p className="font-['Barlow_Condensed'] text-2xl font-bold text-[#DC2626]">{formatCurrency(taxCalc.totalExpenses)}</p>
          </div>
          <div>
            <p className="text-xs text-[#888] uppercase tracking-wide mb-1">Net Profit</p>
            <p className={`font-['Barlow_Condensed'] text-2xl font-bold ${taxCalc.netProfit >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
              {formatCurrency(taxCalc.netProfit)}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tax calendar */}
        <Card>
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
            <Calendar className="w-4 h-4 inline mr-2" />
            Upcoming Tax Deadlines
          </h3>
          <div className="space-y-2">
            {TAX_DEADLINES.map(d => {
              const days = daysUntilDeadline(d.dueDay);
              return (
                <div key={d.name} className="flex items-center justify-between py-2 border-b border-[#f5f5f5] last:border-0">
                  <div>
                    <p className="text-sm font-medium text-[#070707]">{d.name}</p>
                    <p className="text-xs text-[#888]">{d.description}</p>
                  </div>
                  <Badge variant={days <= 5 ? 'red' : days <= 10 ? 'amber' : 'green'}>
                    {days}d
                  </Badge>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Advance tax schedule */}
        <Card>
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
            Advance Tax Schedule
          </h3>
          <div className="space-y-2">
            {ADVANCE_TAX_DATES.map(q => {
              const dueAmount = taxCalc.advanceTaxEst * q.percentage / 100;
              return (
                <div key={q.quarter} className="flex items-center justify-between py-2 border-b border-[#f5f5f5] last:border-0">
                  <div>
                    <p className="text-sm font-medium">{q.quarter} — {q.date}</p>
                    <p className="text-xs text-[#888]">{q.percentage}% of annual tax due</p>
                  </div>
                  <span className="text-sm tabular-nums font-medium">{formatCurrency(dueAmount)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
