/**
 * Respawn Finance — Storage Layer (Supabase implementation)
 *
 * To use this:
 * 1. npm install @supabase/supabase-js
 * 2. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars
 * 3. Copy this file to src/lib/storage.ts
 *
 * NOTE: This is async. The localStorage version was sync. You'll need to
 * update the components that call these functions to use `await` and
 * `useEffect` for data loading. We can do that in a follow-up step OR
 * wrap each function with a sync cache layer (recommended for minimal changes).
 */

import { createClient } from '@supabase/supabase-js';
import type {
  AuditLog, BankStatement, BankTransaction, CashTransaction, CashBalanceLog,
  Category, NarrationCategoryMap, ClientVertical, Client, ClientMonthlyCost,
  Invoice, TaxSettings, TaxSummaryMonthly, GuruConversation, GuruMessage,
  AppSettings, TeamMember, InvoiceSettings, ExpenseAttribution,
} from '@/types';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn('Supabase credentials not set. App will not function correctly.');
}

export const supabase = createClient(url || '', key || '');

// ─── Audit Log ──────────────────────────────────────────────────────────────
export async function getAuditLog(): Promise<AuditLog[]> {
  const { data } = await supabase.from('audit_log').select('*').order('timestamp', { ascending: false }).limit(1000);
  return data || [];
}
export async function addAuditEntry(entry: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
  await supabase.from('audit_log').insert(entry);
}

// ─── Bank Statements ────────────────────────────────────────────────────────
export async function getBankStatements(): Promise<BankStatement[]> {
  const { data } = await supabase.from('bank_statements').select('*').order('uploaded_at', { ascending: false });
  return data || [];
}
export async function addBankStatement(s: Omit<BankStatement, 'id' | 'uploaded_at'>): Promise<BankStatement> {
  const { data, error } = await supabase.from('bank_statements').insert(s).select().single();
  if (error) throw error;
  return data;
}
export async function updateBankStatement(id: string, u: Partial<BankStatement>): Promise<void> {
  await supabase.from('bank_statements').update(u).eq('id', id);
}

// ─── Bank Transactions ──────────────────────────────────────────────────────
export async function getBankTransactions(): Promise<BankTransaction[]> {
  const { data } = await supabase.from('bank_transactions').select('*').order('date', { ascending: false });
  return data || [];
}
export async function getBankTransactionsByStatement(sid: string): Promise<BankTransaction[]> {
  const { data } = await supabase.from('bank_transactions').select('*').eq('statement_id', sid);
  return data || [];
}
export async function addBankTransactions(txns: Omit<BankTransaction, 'id'>[]): Promise<BankTransaction[]> {
  const { data, error } = await supabase.from('bank_transactions').insert(txns).select();
  if (error) throw error;
  return data || [];
}
export async function updateBankTransaction(id: string, u: Partial<BankTransaction>): Promise<void> {
  await supabase.from('bank_transactions').update(u).eq('id', id);
}
export async function deleteBankTransaction(id: string): Promise<void> {
  await supabase.from('bank_transactions').delete().eq('id', id);
}

// ─── Cash Transactions ──────────────────────────────────────────────────────
export async function getCashTransactions(): Promise<CashTransaction[]> {
  const { data } = await supabase.from('cash_transactions').select('*').order('date', { ascending: false });
  return data || [];
}
export async function addCashTransaction(t: Omit<CashTransaction, 'id'>): Promise<CashTransaction> {
  const { data, error } = await supabase.from('cash_transactions').insert(t).select().single();
  if (error) throw error;
  return data;
}
export async function updateCashTransaction(id: string, u: Partial<CashTransaction>): Promise<void> {
  await supabase.from('cash_transactions').update(u).eq('id', id);
}
export async function deleteCashTransaction(id: string): Promise<void> {
  await supabase.from('cash_transactions').delete().eq('id', id);
}

// ─── Cash Balance Log ───────────────────────────────────────────────────────
export async function getCashBalanceLog(): Promise<CashBalanceLog[]> {
  const { data } = await supabase.from('cash_balance_log').select('*').order('date', { ascending: false });
  return data || [];
}
export async function addCashBalanceLog(e: Omit<CashBalanceLog, 'id'>): Promise<CashBalanceLog> {
  const { data, error } = await supabase.from('cash_balance_log').insert(e).select().single();
  if (error) throw error;
  return data;
}

// ─── Categories ─────────────────────────────────────────────────────────────
export async function getCategories(): Promise<Category[]> {
  const { data } = await supabase.from('categories').select('*');
  return data || [];
}
export async function addCategory(c: Omit<Category, 'id'>): Promise<Category> {
  const { data, error } = await supabase.from('categories').insert(c).select().single();
  if (error) throw error;
  return data;
}
export async function updateCategory(id: string, u: Partial<Category>): Promise<void> {
  await supabase.from('categories').update(u).eq('id', id);
}
export async function deleteCategory(id: string): Promise<void> {
  await supabase.from('categories').delete().eq('id', id);
}

// ─── Narration Map ──────────────────────────────────────────────────────────
export async function getNarrationMap(): Promise<NarrationCategoryMap[]> {
  const { data } = await supabase.from('narration_map').select('*');
  return data || [];
}
export async function upsertNarrationMap(narration_pattern: string, category_id: string): Promise<void> {
  await supabase.from('narration_map').upsert({ narration_pattern, category_id, confidence: 1 }, { onConflict: 'narration_pattern' });
}

// ─── Verticals ──────────────────────────────────────────────────────────────
export async function getVerticals(): Promise<ClientVertical[]> {
  const { data } = await supabase.from('verticals').select('*');
  return data || [];
}
export async function addVertical(v: Omit<ClientVertical, 'is_custom'>): Promise<ClientVertical> {
  const { data, error } = await supabase.from('verticals').insert({ ...v, is_custom: true }).select().single();
  if (error) throw error;
  return data;
}
export async function deleteVertical(id: string): Promise<void> {
  await supabase.from('verticals').delete().eq('id', id);
}

// ─── Clients ────────────────────────────────────────────────────────────────
export async function getClients(): Promise<Client[]> {
  const { data } = await supabase.from('clients').select('*');
  return data || [];
}
export async function addClient(c: Omit<Client, 'id'>): Promise<Client> {
  const { data, error } = await supabase.from('clients').insert(c).select().single();
  if (error) throw error;
  return data;
}
export async function updateClient(id: string, u: Partial<Client>): Promise<void> {
  await supabase.from('clients').update(u).eq('id', id);
}
export async function deleteClient(id: string): Promise<void> {
  await supabase.from('clients').delete().eq('id', id);
}

// ─── Client Monthly Costs ───────────────────────────────────────────────────
export async function getClientMonthlyCosts(): Promise<ClientMonthlyCost[]> {
  const { data } = await supabase.from('client_monthly_costs').select('*');
  return data || [];
}
export async function getClientMonthlyCost(client_id: string, month: string): Promise<ClientMonthlyCost | null> {
  const { data } = await supabase.from('client_monthly_costs').select('*').eq('client_id', client_id).eq('month', month).maybeSingle();
  return data;
}
export async function upsertClientMonthlyCost(cost: Omit<ClientMonthlyCost, 'id'>): Promise<ClientMonthlyCost> {
  const { data, error } = await supabase.from('client_monthly_costs')
    .upsert(cost, { onConflict: 'client_id,month' })
    .select().single();
  if (error) throw error;
  return data;
}

// ─── Invoices ───────────────────────────────────────────────────────────────
export async function getInvoices(): Promise<Invoice[]> {
  const { data } = await supabase.from('invoices').select('*').order('invoice_date', { ascending: false });
  return data || [];
}
export async function getInvoicesByClient(clientId: string): Promise<Invoice[]> {
  const { data } = await supabase.from('invoices').select('*').eq('client_id', clientId);
  return data || [];
}
export async function addInvoice(i: Omit<Invoice, 'id'>): Promise<Invoice> {
  const { data, error } = await supabase.from('invoices').insert(i).select().single();
  if (error) throw error;
  return data;
}
export async function updateInvoice(id: string, u: Partial<Invoice>): Promise<void> {
  await supabase.from('invoices').update(u).eq('id', id);
}
export async function deleteInvoice(id: string): Promise<void> {
  await supabase.from('invoices').delete().eq('id', id);
}

// ─── Invoice Settings ───────────────────────────────────────────────────────
export async function getInvoiceSettings(): Promise<InvoiceSettings | null> {
  const { data } = await supabase.from('invoice_settings').select('*').eq('id', 1).maybeSingle();
  return data;
}
export async function setInvoiceSettings(s: InvoiceSettings): Promise<void> {
  await supabase.from('invoice_settings').upsert({ ...s, id: 1 });
}

// ─── Team Members ───────────────────────────────────────────────────────────
export async function getTeamMembers(): Promise<TeamMember[]> {
  const { data } = await supabase.from('team_members').select('*');
  return data || [];
}
export async function addTeamMember(m: Omit<TeamMember, 'id'>): Promise<TeamMember> {
  const { data, error } = await supabase.from('team_members').insert(m).select().single();
  if (error) throw error;
  return data;
}
export async function updateTeamMember(id: string, u: Partial<TeamMember>): Promise<void> {
  await supabase.from('team_members').update(u).eq('id', id);
}
export async function deleteTeamMember(id: string): Promise<void> {
  await supabase.from('team_members').delete().eq('id', id);
}

// ─── Expense Attributions ───────────────────────────────────────────────────
export async function getExpenseAttributions(): Promise<ExpenseAttribution[]> {
  const { data } = await supabase.from('expense_attributions').select('*');
  return data || [];
}
export async function addExpenseAttribution(a: Omit<ExpenseAttribution, 'id' | 'created_at'>): Promise<ExpenseAttribution> {
  const { data, error } = await supabase.from('expense_attributions').insert(a).select().single();
  if (error) throw error;
  return data;
}
export async function updateExpenseAttribution(id: string, u: Partial<ExpenseAttribution>): Promise<void> {
  await supabase.from('expense_attributions').update(u).eq('id', id);
}
export async function getAttributionsByClient(client_id: string): Promise<ExpenseAttribution[]> {
  const { data } = await supabase.from('expense_attributions').select('*').eq('client_id', client_id);
  return data || [];
}
export async function getAttributionsByMonth(month: string): Promise<ExpenseAttribution[]> {
  const { data } = await supabase.from('expense_attributions').select('*').eq('month', month);
  return data || [];
}

// ─── Tax ────────────────────────────────────────────────────────────────────
export async function getTaxSettings(): Promise<TaxSettings | null> {
  const { data } = await supabase.from('tax_settings').select('*').eq('id', 1).maybeSingle();
  return data;
}
export async function setTaxSettings(s: TaxSettings): Promise<void> {
  await supabase.from('tax_settings').upsert({ ...s, id: 1 });
}
export async function getTaxSummaries(): Promise<TaxSummaryMonthly[]> {
  const { data } = await supabase.from('tax_summaries').select('*');
  return data || [];
}
export async function upsertTaxSummary(s: Omit<TaxSummaryMonthly, 'id'>): Promise<void> {
  await supabase.from('tax_summaries').upsert(s, { onConflict: 'month' });
}

// ─── Finance Guru ───────────────────────────────────────────────────────────
export async function getGuruConversations(): Promise<GuruConversation[]> {
  const { data } = await supabase.from('guru_conversations').select('*').order('started_at', { ascending: false });
  return data || [];
}
export async function addGuruConversation(c: Omit<GuruConversation, 'id'>): Promise<GuruConversation> {
  const { data, error } = await supabase.from('guru_conversations').insert(c).select().single();
  if (error) throw error;
  return data;
}
export async function updateGuruConversation(id: string, u: Partial<GuruConversation>): Promise<void> {
  await supabase.from('guru_conversations').update(u).eq('id', id);
}
export async function getGuruMessages(conversation_id: string): Promise<GuruMessage[]> {
  const { data } = await supabase.from('guru_messages').select('*').eq('conversation_id', conversation_id).order('timestamp');
  return data || [];
}
export async function addGuruMessage(m: Omit<GuruMessage, 'id'>): Promise<GuruMessage> {
  const { data, error } = await supabase.from('guru_messages').insert(m).select().single();
  if (error) throw error;
  return data;
}
export async function updateGuruMessage(id: string, u: Partial<GuruMessage>): Promise<void> {
  await supabase.from('guru_messages').update(u).eq('id', id);
}

// ─── App Settings ───────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: AppSettings = {
  cash_opening_balance: 0,
  cash_holder: 'Shlok',
  quick_entries: [],
  founder_salaries: [{ name: 'Shlok', monthly_amount: 0, active: true }, { name: 'Tanay', monthly_amount: 0, active: true }, { name: 'Arihant', monthly_amount: 0, active: true }],
};

export async function getAppSettings(): Promise<AppSettings> {
  const { data } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
  return data || DEFAULT_SETTINGS;
}
export async function updateAppSettings(u: Partial<AppSettings>): Promise<void> {
  const current = await getAppSettings();
  await supabase.from('app_settings').upsert({ ...current, ...u, id: 1 });
}

// ─── Computed ───────────────────────────────────────────────────────────────
export async function computeCashBalance(): Promise<number> {
  const settings = await getAppSettings();
  const txns = await getCashTransactions();
  return txns.reduce((bal, t) => t.type === 'Cash In' ? bal + t.amount : bal - t.amount, settings.cash_opening_balance);
}

// ─── Backup & Restore (still localStorage-style export for manual backup) ──
export async function exportAllData(): Promise<Record<string, unknown>> {
  const [
    audit_log, bank_statements, bank_transactions, cash_transactions, cash_balance_log,
    categories, narration_map, verticals, clients, client_monthly_costs, invoices,
    invoice_settings, team_members, expense_attributions, tax_settings, tax_summaries,
    guru_conversations, guru_messages, app_settings,
  ] = await Promise.all([
    supabase.from('audit_log').select('*'),
    supabase.from('bank_statements').select('*'),
    supabase.from('bank_transactions').select('*'),
    supabase.from('cash_transactions').select('*'),
    supabase.from('cash_balance_log').select('*'),
    supabase.from('categories').select('*'),
    supabase.from('narration_map').select('*'),
    supabase.from('verticals').select('*'),
    supabase.from('clients').select('*'),
    supabase.from('client_monthly_costs').select('*'),
    supabase.from('invoices').select('*'),
    supabase.from('invoice_settings').select('*'),
    supabase.from('team_members').select('*'),
    supabase.from('expense_attributions').select('*'),
    supabase.from('tax_settings').select('*'),
    supabase.from('tax_summaries').select('*'),
    supabase.from('guru_conversations').select('*'),
    supabase.from('guru_messages').select('*'),
    supabase.from('app_settings').select('*'),
  ]);
  return {
    audit_log: audit_log.data, bank_statements: bank_statements.data,
    bank_transactions: bank_transactions.data, cash_transactions: cash_transactions.data,
    cash_balance_log: cash_balance_log.data, categories: categories.data,
    narration_map: narration_map.data, verticals: verticals.data, clients: clients.data,
    client_monthly_costs: client_monthly_costs.data, invoices: invoices.data,
    invoice_settings: invoice_settings.data, team_members: team_members.data,
    expense_attributions: expense_attributions.data, tax_settings: tax_settings.data,
    tax_summaries: tax_summaries.data, guru_conversations: guru_conversations.data,
    guru_messages: guru_messages.data, app_settings: app_settings.data,
  };
}

export async function importAllData(_data: Record<string, unknown>): Promise<void> {
  throw new Error('Use the migration script in supabase/migrate.js to import localStorage data.');
}

export async function clearAllData(): Promise<void> {
  throw new Error('Clearing data in Supabase must be done via SQL Editor or Table Editor. This is a safety guardrail.');
}
