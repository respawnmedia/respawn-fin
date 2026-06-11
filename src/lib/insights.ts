/**
 * Respawn Finance — Insights & Smart Questions Engine v2
 *
 * Richer context: uses transaction purposes, freelancer names,
 * client attribution, and historical patterns to ask specific questions.
 */

import {
  getClients, getClientMonthlyCosts, getTeamMembers,
  getBankTransactions, getCashTransactions, getInvoices,
  getCategories, getExpenseApprovals, getPaymentReminderConfig,
} from '@/lib/storage';
import { getPaymentsByClient } from '@/lib/payments';
import { currentMonth, monthsAgo, formatCurrency, formatMonth, formatDate } from '@/utils/format';

export type InsightSeverity = 'question' | 'warning' | 'info';
export type InsightCategory = 'client_cost' | 'team' | 'payment' | 'transaction' | 'tax' | 'general' | 'approval';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  category: InsightCategory;
  title: string;
  body: string;
  action?: string;
  actionRoute?: string;
  data?: Record<string, unknown>;
  dismissible: boolean;
  createdAt: string;
}

const DISMISSED_KEY = 'rf:dismissed_insights';
export function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); } catch { return []; }
}
export function dismissInsight(id: string): void {
  const d = getDismissed();
  if (!d.includes(id)) { d.push(id); localStorage.setItem(DISMISSED_KEY, JSON.stringify(d)); }
}
export function clearDismissed(): void { localStorage.removeItem(DISMISSED_KEY); }

export function computeInsights(): Insight[] {
  const insights: Insight[] = [];
  const dismissed = getDismissed();
  const add = (i: Omit<Insight, 'createdAt'>) => {
    if (!dismissed.includes(i.id)) insights.push({ ...i, createdAt: new Date().toISOString() });
  };

  const clients = getClients().filter(c => c.status === 'active');
  const teamMembers = getTeamMembers().filter(m => m.active);
  const monthlyCosts = getClientMonthlyCosts();
  const bankTxns = getBankTransactions();
  const cashTxns = getCashTransactions();
  const invoices = getInvoices();
  const categories = getCategories();
  const approvals = getExpenseApprovals();
  const reminderConfig = getPaymentReminderConfig();
  const thisMonth = currentMonth();
  const lastMonth = monthsAgo(1);
  const today = new Date().toISOString().split('T')[0];
  const dayOfMonth = new Date().getDate();

  // ── Helpers ───────────────────────────────────────────────────────────────
  function clientName(id?: string) { return clients.find(c => c.id === id)?.name || '?'; }
  function catName(id?: string) { return categories.find(c => c.id === id)?.name || 'Uncategorized'; }

  // ── 1. Cost > retainer (per client) ───────────────────────────────────────
  clients.forEach(client => {
    const sheet = monthlyCosts.find(c => c.client_id === client.id && c.month === thisMonth);
    const teamCost = teamMembers.reduce((s, m) => {
      const alloc = m.client_allocations.find(a => a.client_id === client.id);
      return s + (alloc ? m.monthly_cost * alloc.percentage / 100 : 0);
    }, 0);
    const directCost = sheet?.total_cost || 0;
    const totalCost = directCost + teamCost;
    if (totalCost > client.retainer_amount * 1.05 && totalCost > 0) {
      const loss = totalCost - client.retainer_amount;
      add({
        id: `cost_exceeds_retainer_${client.id}_${thisMonth}`,
        severity: 'warning', category: 'client_cost',
        title: `${client.name}: losing ${formatCurrency(loss)} this month`,
        body: `Retainer: ${formatCurrency(client.retainer_amount)}\nDirect costs: ${formatCurrency(directCost)}\nTeam allocation: ${formatCurrency(teamCost)}\nTotal: ${formatCurrency(totalCost)} (${formatCurrency(loss)} over retainer)\n\nConsider renegotiating the retainer or reducing spend.`,
        action: 'Review cost sheet', actionRoute: '/clients', dismissible: true,
      });
    }
  });

  // ── 2. Shoot transactions not linked to a client ───────────────────────────
  const shootCatIds = new Set(categories.filter(c =>
    ['Shoot Costs', 'Videography', 'Photography', 'Editing'].includes(c.name)
  ).map(c => c.id));
  const unlinkedShoots = bankTxns.filter(t =>
    t.date >= lastMonth && t.debit > 0 && shootCatIds.has(t.category_id) && !t.client_id
  );
  if (unlinkedShoots.length > 0) {
    const total = unlinkedShoots.reduce((s, t) => s + t.debit, 0);
    add({
      id: `unlinked_shoots_${thisMonth}`,
      severity: 'question', category: 'client_cost',
      title: `${unlinkedShoots.length} shoot/production expense${unlinkedShoots.length > 1 ? 's' : ''} not linked to any client`,
      body: unlinkedShoots.slice(0, 3).map(t =>
        `• ${formatCurrency(t.debit)} on ${formatDate(t.date)} — "${t.narration.slice(0, 50)}"`
      ).join('\n') + `\n\nTotal: ${formatCurrency(total)}. Link these to the right client so costs appear in P&L.`,
      action: 'Review bank transactions', actionRoute: '/bank', dismissible: true,
    });
  }

  // ── 3. Freelancer paid but not linked ─────────────────────────────────────
  const freelancerCatIds = new Set(categories.filter(c => ['Freelancer Fees', 'Professional Fees'].includes(c.name)).map(c => c.id));
  const unlinkedFreelancers = bankTxns.filter(t =>
    t.date >= lastMonth && t.debit > 0 && freelancerCatIds.has(t.category_id) && !t.client_id && !t.reason
  );
  if (unlinkedFreelancers.length > 0) {
    add({
      id: `unlinked_freelancers_${thisMonth}`,
      severity: 'question', category: 'transaction',
      title: `${unlinkedFreelancers.length} freelancer payment${unlinkedFreelancers.length > 1 ? 's' : ''} need context`,
      body: unlinkedFreelancers.slice(0, 4).map(t =>
        `• ${formatCurrency(t.debit)} → "${t.narration.slice(0, 40)}" on ${formatDate(t.date)}`
      ).join('\n') + '\n\nFor each: which client was this work for? Which freelancer? What purpose?',
      action: 'Add reasons', actionRoute: '/bank', dismissible: true,
    });
  }

  // ── 4. Client name in narration, not linked ────────────────────────────────
  clients.forEach(client => {
    const nameLower = client.name.toLowerCase().split(' ')[0];
    if (nameLower.length < 3) return;
    const unlinked = bankTxns.filter(t =>
      t.date >= lastMonth && t.debit > 0 &&
      t.narration.toLowerCase().includes(nameLower) && !t.client_id
    );
    if (unlinked.length > 0) {
      add({
        id: `client_narration_${client.id}_${thisMonth}`,
        severity: 'question', category: 'transaction',
        title: `"${client.name}" found in ${unlinked.length} unlinked transaction${unlinked.length > 1 ? 's' : ''}`,
        body: unlinked.slice(0, 3).map(t =>
          `• ${formatCurrency(t.debit)} on ${formatDate(t.date)} — "${t.narration.slice(0, 50)}"`
        ).join('\n') + `\n\nShould these be attributed to ${client.name}?`,
        action: 'Review', actionRoute: '/bank', dismissible: true,
      });
    }
  });

  // ── 5. Team over-allocated ─────────────────────────────────────────────────
  teamMembers.forEach(member => {
    const total = member.client_allocations.reduce((s, a) => s + a.percentage, 0);
    if (total > 100) {
      add({
        id: `overallocated_${member.id}`,
        severity: 'warning', category: 'team',
        title: `${member.name} over-allocated (${total}%)`,
        body: `Allocations: ${member.client_allocations.map(a => `${clientName(a.client_id)} ${a.percentage}%`).join(', ')}. Total is ${total}% — should be ≤100%. Excess costs won't show correctly in P&L.`,
        action: 'Fix', actionRoute: '/team', dismissible: true,
      });
    }
  });

  // ── 6. Unallocated team members ───────────────────────────────────────────
  const unallocated = teamMembers.filter(m =>
    m.monthly_cost > 0 && m.client_allocations.reduce((s, a) => s + a.percentage, 0) === 0
  );
  if (unallocated.length > 0) {
    add({
      id: `unallocated_${thisMonth}`,
      severity: 'question', category: 'team',
      title: `${unallocated.length} team member${unallocated.length > 1 ? 's' : ''} not allocated`,
      body: unallocated.map(m => `${m.name} (${formatCurrency(m.monthly_cost)}/mo)`).join(', ') + ' — not assigned to any client. Their costs are invisible in P&L.',
      action: 'Fix allocations', actionRoute: '/team', dismissible: true,
    });
  }

  // ── 7. Overdue invoices ────────────────────────────────────────────────────
  const overdue = invoices.filter(i => ['Sent', 'Partially Paid'].includes(i.status) && i.due_date < today);
  if (overdue.length > 0) {
    const total = overdue.reduce((s, i) => s + i.total, 0);
    const lines = overdue.slice(0, 4).map(inv => {
      const days = Math.floor((new Date(today).getTime() - new Date(inv.due_date).getTime()) / 86400000);
      const paid = getPaymentsByClient(inv.client_id).filter(p => p.for_month === inv.invoice_date.slice(0, 7)).reduce((s, p) => s + p.amount, 0);
      return `• ${clientName(inv.client_id)}: ${formatCurrency(inv.total)} (${days}d overdue)${paid > 0 ? ` — ${formatCurrency(paid)} received` : ''}`;
    });
    add({
      id: `overdue_${thisMonth}`,
      severity: 'warning', category: 'payment',
      title: `${formatCurrency(total)} overdue across ${overdue.length} invoice${overdue.length > 1 ? 's' : ''}`,
      body: lines.join('\n'),
      action: 'Follow up', actionRoute: '/clients', dismissible: false,
    });
  }

  // ── 8. Payment reminder trigger ────────────────────────────────────────────
  if (reminderConfig.enabled && dayOfMonth >= reminderConfig.remind_day) {
    const unpaidClients = clients.filter(client => {
      const thisMonthPayments = getPaymentsByClient(client.id).filter(p => p.for_month === thisMonth);
      const totalPaid = thisMonthPayments.reduce((s, p) => s + p.amount, 0);
      return totalPaid < client.retainer_amount * 0.9; // less than 90% paid
    });
    if (unpaidClients.length > 0) {
      add({
        id: `payment_reminder_${thisMonth}_day${dayOfMonth}`,
        severity: 'warning', category: 'payment',
        title: `${unpaidClients.length} client${unpaidClients.length > 1 ? 's' : ''} haven't paid for ${formatMonth(thisMonth)}`,
        body: unpaidClients.map(c => {
          const paid = getPaymentsByClient(c.id).filter(p => p.for_month === thisMonth).reduce((s, p) => s + p.amount, 0);
          return `• ${c.name}: ${formatCurrency(c.retainer_amount)} retainer, ${paid > 0 ? formatCurrency(paid) + ' received' : 'nothing received yet'}`;
        }).join('\n') + '\n\nSend a WhatsApp reminder from Recurring & Reminders page.',
        action: 'Send reminder', actionRoute: '/recurring', dismissible: true,
      });
    }
  }

  // ── 9. Pending expense approvals ──────────────────────────────────────────
  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  if (pendingApprovals.length > 0) {
    const total = pendingApprovals.reduce((s, a) => s + a.amount, 0);
    add({
      id: `pending_approvals_${thisMonth}`,
      severity: 'question', category: 'approval',
      title: `${pendingApprovals.length} expense${pendingApprovals.length > 1 ? 's' : ''} pending your approval`,
      body: pendingApprovals.slice(0, 3).map(a =>
        `• ${a.submitted_by}: ${formatCurrency(a.amount)} — ${a.description}${a.purpose ? ` (${a.purpose})` : ''}`
      ).join('\n') + `\n\nTotal pending: ${formatCurrency(total)}`,
      action: 'Review approvals', actionRoute: '/approvals', dismissible: false,
    });
  }

  // ── 10. No cost sheets for active clients ─────────────────────────────────
  clients.forEach(client => {
    const hasSheet = monthlyCosts.some(c => c.client_id === client.id && c.month === thisMonth);
    if (!hasSheet && (client.fixed_cost_items || []).length > 0) {
      add({
        id: `no_cost_sheet_${client.id}_${thisMonth}`,
        severity: 'info', category: 'client_cost',
        title: `${client.name}: cost sheet for ${formatMonth(thisMonth)} is empty`,
        body: `Template items: ${client.fixed_cost_items.map(i => `${i.label} (${formatCurrency(i.estimated_amount, true)})`).join(', ')}. Fill in actuals to see accurate P&L.`,
        action: 'Fill cost sheet', actionRoute: '/clients', dismissible: true,
      });
    }
  });

  // ── 11. GST on large cash receipts ────────────────────────────────────────
  const cashWithoutGst = cashTxns.filter(t =>
    t.type === 'Cash In' && t.date >= lastMonth && t.amount > 10000 &&
    !t.tags.includes('gst-noted') && !t.tags.includes('no-gst')
  );
  if (cashWithoutGst.length > 0) {
    add({
      id: `cash_gst_${thisMonth}`,
      severity: 'question', category: 'tax',
      title: `${cashWithoutGst.length} large cash receipt${cashWithoutGst.length > 1 ? 's' : ''} — GST recorded?`,
      body: cashWithoutGst.slice(0, 3).map(t =>
        `• ${formatCurrency(t.amount)} from ${t.party} on ${formatDate(t.date)}`
      ).join('\n') + '\n\nIf clients paid GST on these, edit the transaction to record it for proper tax accounting.',
      action: 'Review', actionRoute: '/cash', dismissible: true,
    });
  }

  // ── 12. No bank statement recent ──────────────────────────────────────────
  const hasBankThisMonth = bankTxns.some(t => t.date.startsWith(thisMonth));
  const hasBankLastMonth = bankTxns.some(t => t.date.startsWith(lastMonth));
  if (!hasBankThisMonth && !hasBankLastMonth) {
    add({
      id: `no_bank_statement_${thisMonth}`,
      severity: 'info', category: 'general',
      title: `No bank transactions for ${formatMonth(thisMonth)} or ${formatMonth(lastMonth)}`,
      body: 'Upload your bank statement PDF to see the full financial picture. Required for accurate P&L and burn rate.',
      action: 'Upload statement', actionRoute: '/bank', dismissible: true,
    });
  }

  const order: Record<InsightSeverity, number> = { warning: 0, question: 1, info: 2 };
  return insights.sort((a, b) => order[a.severity] - order[b.severity]);
}
