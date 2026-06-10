/**
 * Respawn Finance — Insights & Smart Questions Engine
 *
 * Scans data for misalignments, gaps, and anomalies.
 * Returns a list of questions / alerts for the user to resolve.
 */

import {
  getClients, getClientMonthlyCosts, getTeamMembers,
  getBankTransactions, getCashTransactions, getInvoices,
  getCategories, getExpenseAttributions,
} from '@/lib/storage';
import { currentMonth, monthsAgo, formatCurrency, formatMonth } from '@/utils/format';

export type InsightSeverity = 'question' | 'warning' | 'info';
export type InsightCategory = 'client_cost' | 'team' | 'payment' | 'transaction' | 'tax' | 'general';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  category: InsightCategory;
  title: string;
  body: string;
  action?: string;        // label for the CTA button
  actionRoute?: string;   // which page to navigate to
  data?: Record<string, unknown>; // extra context for pre-filling forms
  dismissible: boolean;
  createdAt: string;
}

const DISMISSED_KEY = 'rf:dismissed_insights';

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); }
  catch { return []; }
}
export function dismissInsight(id: string): void {
  const d = getDismissed();
  if (!d.includes(id)) d.push(id);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(d));
}
export function clearDismissed(): void {
  localStorage.removeItem(DISMISSED_KEY);
}

export function computeInsights(): Insight[] {
  const insights: Insight[] = [];
  const dismissed = getDismissed();
  const add = (i: Omit<Insight, 'createdAt'>) => {
    if (!dismissed.includes(i.id)) {
      insights.push({ ...i, createdAt: new Date().toISOString() });
    }
  };

  const clients = getClients().filter(c => c.status === 'active');
  const teamMembers = getTeamMembers().filter(m => m.active);
  const monthlyCosts = getClientMonthlyCosts();
  const bankTxns = getBankTransactions();
  const cashTxns = getCashTransactions();
  const invoices = getInvoices();
  const categories = getCategories();
  const thisMonth = currentMonth();
  const lastMonth = monthsAgo(1);

  // ── 1. Team allocation doesn't add up to client cost ──────────────────────
  clients.forEach(client => {
    const sheet = monthlyCosts.find(c => c.client_id === client.id && c.month === thisMonth);
    if (!sheet) return;

    const teamCostForClient = teamMembers.reduce((s, m) => {
      const alloc = m.client_allocations.find(a => a.client_id === client.id);
      return s + (alloc ? m.monthly_cost * alloc.percentage / 100 : 0);
    }, 0);

    const directCost = sheet.total_cost;
    const totalCost = directCost + teamCostForClient;
    const retainer = client.retainer_amount;

    // Cost exceeds retainer
    if (totalCost > retainer * 1.1) {
      add({
        id: `cost_exceeds_retainer_${client.id}_${thisMonth}`,
        severity: 'warning',
        category: 'client_cost',
        title: `${client.name}: costs exceed retainer`,
        body: `Total cost this month is ${formatCurrency(totalCost)} (direct ${formatCurrency(directCost)} + team ${formatCurrency(teamCostForClient)}), but retainer is only ${formatCurrency(retainer)}. You're losing ${formatCurrency(totalCost - retainer)} on this client.`,
        action: 'Review cost sheet',
        actionRoute: '/clients',
        dismissible: true,
      });
    }

    // Team cost inconsistency with direct cost items
    const shootItem = sheet.line_items.find(l => l.label.toLowerCase().includes('shoot'));
    if (shootItem && shootItem.actual_amount > 0 && teamCostForClient === 0) {
      add({
        id: `shoot_no_team_${client.id}_${thisMonth}`,
        severity: 'question',
        category: 'client_cost',
        title: `${client.name}: shoot logged but no team cost`,
        body: `You entered a shoot cost of ${formatCurrency(shootItem.actual_amount)} for ${client.name} but no team members are allocated to this client. Was the shoot done by a freelancer not in the system?`,
        action: 'Review team allocation',
        actionRoute: '/team',
        dismissible: true,
      });
    }
  });

  // ── 2. Team allocation percentages don't add up ────────────────────────────
  teamMembers.forEach(member => {
    const total = member.client_allocations.reduce((s, a) => s + a.percentage, 0);
    if (total > 100) {
      add({
        id: `overallocated_${member.id}`,
        severity: 'warning',
        category: 'team',
        title: `${member.name} is over-allocated`,
        body: `${member.name}'s client allocations add up to ${total}% which exceeds 100%. Currently allocated: ${member.client_allocations.map(a => {
          const c = clients.find(cl => cl.id === a.client_id);
          return `${c?.name || '?'} ${a.percentage}%`;
        }).join(', ')}. Please fix this so costs are accurate.`,
        action: 'Fix allocation',
        actionRoute: '/team',
        dismissible: true,
      });
    }
  });

  // ── 3. Active clients with no cost sheet this month ────────────────────────
  clients.forEach(client => {
    const hasSheet = monthlyCosts.some(c => c.client_id === client.id && c.month === thisMonth);
    if (!hasSheet && client.fixed_cost_items && client.fixed_cost_items.length > 0) {
      add({
        id: `no_cost_sheet_${client.id}_${thisMonth}`,
        severity: 'question',
        category: 'client_cost',
        title: `${client.name}: no cost sheet for ${formatMonth(thisMonth)}`,
        body: `${client.name} has fixed cost items defined (${client.fixed_cost_items.map(i => i.label).join(', ')}) but no cost sheet has been filled for this month yet. Want to fill it in?`,
        action: 'Fill cost sheet',
        actionRoute: '/clients',
        data: { clientId: client.id, month: thisMonth },
        dismissible: true,
      });
    }
  });

  // ── 4. Large bank transactions without a reason or client ─────────────────
  const recentExpenses = bankTxns.filter(t =>
    t.date >= monthsAgo(1) &&
    t.debit > 5000 &&
    !t.reason &&
    !t.client_id
  );
  if (recentExpenses.length > 0) {
    recentExpenses.slice(0, 3).forEach(txn => {
      add({
        id: `untagged_large_txn_${txn.id}`,
        severity: 'question',
        category: 'transaction',
        title: `Large expense needs context`,
        body: `Bank debit of ${formatCurrency(txn.debit)} on ${txn.date} — "${txn.narration}" has no reason or client linked. Was this for a specific client or project?`,
        action: 'Add reason',
        actionRoute: '/bank',
        data: { transactionId: txn.id },
        dismissible: true,
      });
    });
  }

  // ── 5. Client name appears in bank narration but not linked ───────────────
  clients.forEach(client => {
    const nameLower = client.name.toLowerCase().split(' ')[0]; // first word
    if (nameLower.length < 3) return;
    const unlinked = bankTxns.filter(t =>
      t.date >= monthsAgo(1) &&
      t.debit > 0 &&
      t.narration.toLowerCase().includes(nameLower) &&
      !t.client_id
    );
    if (unlinked.length > 0) {
      add({
        id: `client_in_narration_${client.id}_${monthsAgo(0)}`,
        severity: 'question',
        category: 'transaction',
        title: `"${client.name}" appears in ${unlinked.length} transaction${unlinked.length > 1 ? 's' : ''}`,
        body: `Found ${unlinked.length} bank transaction${unlinked.length > 1 ? 's' : ''} mentioning "${client.name}" that aren't linked to this client: ${unlinked.slice(0, 2).map(t => `${formatCurrency(t.debit)} on ${t.date}`).join(', ')}. Should these be attributed to ${client.name}?`,
        action: 'Review transactions',
        actionRoute: '/bank',
        dismissible: true,
      });
    }
  });

  // ── 6. Overdue invoices ────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const overdue = invoices.filter(i =>
    ['Sent', 'Partially Paid'].includes(i.status) &&
    i.due_date < today
  );
  if (overdue.length > 0) {
    const total = overdue.reduce((s, i) => s + i.total, 0);
    add({
      id: `overdue_invoices_${thisMonth}`,
      severity: 'warning',
      category: 'payment',
      title: `${overdue.length} overdue invoice${overdue.length > 1 ? 's' : ''} — ${formatCurrency(total)} uncollected`,
      body: overdue.slice(0, 3).map(inv => {
        const client = clients.find(c => c.id === inv.client_id);
        const days = Math.floor((new Date(today).getTime() - new Date(inv.due_date).getTime()) / 86400000);
        return `${client?.name || '?'} — ${formatCurrency(inv.total)} (${days}d overdue)`;
      }).join('\n'),
      action: 'View invoices',
      actionRoute: '/clients',
      dismissible: true,
    });
  }

  // ── 7. Cash transactions missing GST component ────────────────────────────
  const cashWithoutGst = cashTxns.filter(t =>
    t.type === 'Cash In' &&
    t.date >= monthsAgo(1) &&
    t.amount > 10000 &&
    !(t as typeof t & { gst_amount?: number }).gst_amount &&
    !t.tags.includes('gst-noted')
  );
  if (cashWithoutGst.length > 0) {
    add({
      id: `cash_missing_gst_${thisMonth}`,
      severity: 'question',
      category: 'tax',
      title: `${cashWithoutGst.length} cash receipt${cashWithoutGst.length > 1 ? 's' : ''} may be missing GST`,
      body: `You have ${cashWithoutGst.length} cash receipt${cashWithoutGst.length > 1 ? 's' : ''} above ₹10K with no GST recorded. If clients paid GST on these, it should be tracked separately. Total cash in: ${formatCurrency(cashWithoutGst.reduce((s, t) => s + t.amount, 0))}.`,
      action: 'Review cash transactions',
      actionRoute: '/cash',
      dismissible: true,
    });
  }

  // ── 8. No bank statement uploaded this month ──────────────────────────────
  const hasStatementThisMonth = bankTxns.some(t => t.date.startsWith(thisMonth));
  const hasStatementLastMonth = bankTxns.some(t => t.date.startsWith(lastMonth));
  if (!hasStatementThisMonth && !hasStatementLastMonth) {
    add({
      id: `no_bank_statement_${thisMonth}`,
      severity: 'info',
      category: 'general',
      title: `No bank transactions for ${formatMonth(thisMonth)} or ${formatMonth(lastMonth)}`,
      body: `Upload your bank statement PDF to get the full financial picture. Bank data feeds the dashboard, P&L, and Finance Guru analysis.`,
      action: 'Upload statement',
      actionRoute: '/bank',
      dismissible: true,
    });
  }

  // ── 9. Team member with 0% allocation ─────────────────────────────────────
  const unallocated = teamMembers.filter(m =>
    m.monthly_cost > 0 &&
    m.client_allocations.reduce((s, a) => s + a.percentage, 0) === 0
  );
  if (unallocated.length > 0) {
    add({
      id: `unallocated_team_${thisMonth}`,
      severity: 'question',
      category: 'team',
      title: `${unallocated.length} team member${unallocated.length > 1 ? 's' : ''} not allocated to any client`,
      body: `${unallocated.map(m => m.name).join(', ')} ${unallocated.length > 1 ? 'have' : 'has'} a monthly cost of ${formatCurrency(unallocated.reduce((s, m) => s + m.monthly_cost, 0))} but ${unallocated.length > 1 ? 'aren\'t' : 'isn\'t'} allocated to any client. Their costs won't appear in P&L. Which clients do they work for?`,
      action: 'Fix allocation',
      actionRoute: '/team',
      dismissible: true,
    });
  }

  // Sort: warnings first, then questions, then info
  const order: Record<InsightSeverity, number> = { warning: 0, question: 1, info: 2 };
  return insights.sort((a, b) => order[a.severity] - order[b.severity]);
}
