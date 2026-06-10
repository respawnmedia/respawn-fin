/**
 * Respawn Finance — Storage Abstraction Layer v2
 * All localStorage access flows through here. Swap to Supabase by rewriting this file only.
 */

import type {
  AuditLog, BankStatement, BankTransaction, CashTransaction, CashBalanceLog,
  Category, NarrationCategoryMap, ClientVertical, Client, ClientMonthlyCost,
  Invoice, TaxSettings, TaxSummaryMonthly, GuruConversation, GuruMessage,
  AppSettings, TeamMember, InvoiceSettings, ExpenseAttribution,
} from '@/types';

const KEYS = {
  AUDIT_LOG: 'rf:audit_log',
  BANK_STATEMENTS: 'rf:bank_statements',
  BANK_TRANSACTIONS: 'rf:bank_transactions',
  CASH_TRANSACTIONS: 'rf:cash_transactions',
  CASH_BALANCE_LOG: 'rf:cash_balance_log',
  CATEGORIES: 'rf:categories',
  NARRATION_MAP: 'rf:narration_map',
  VERTICALS: 'rf:verticals',
  CLIENTS: 'rf:clients',
  CLIENT_MONTHLY_COSTS: 'rf:client_monthly_costs',
  INVOICES: 'rf:invoices',
  INVOICE_SETTINGS: 'rf:invoice_settings',
  TAX_SETTINGS: 'rf:tax_settings',
  TAX_SUMMARIES: 'rf:tax_summaries',
  GURU_CONVERSATIONS: 'rf:guru_conversations',
  GURU_MESSAGES: 'rf:guru_messages',
  APP_SETTINGS: 'rf:app_settings',
  TEAM_MEMBERS: 'rf:team_members',
  EXPENSE_ATTRIBUTIONS: 'rf:expense_attributions',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ─── Audit ────────────────────────────────────────────────────────────────────
export function getAuditLog(): AuditLog[] { return read<AuditLog[]>(KEYS.AUDIT_LOG, []); }
export function addAuditEntry(entry: Omit<AuditLog, 'id' | 'timestamp'>): void {
  const log = getAuditLog();
  log.unshift({ ...entry, id: crypto.randomUUID(), timestamp: new Date().toISOString() });
  write(KEYS.AUDIT_LOG, log.slice(0, 1000));
}

// ─── Bank Statements ──────────────────────────────────────────────────────────
export function getBankStatements(): BankStatement[] { return read<BankStatement[]>(KEYS.BANK_STATEMENTS, []); }
export function addBankStatement(s: Omit<BankStatement, 'id' | 'uploaded_at'>): BankStatement {
  const stmts = getBankStatements();
  const n: BankStatement = { ...s, id: crypto.randomUUID(), uploaded_at: new Date().toISOString() };
  write(KEYS.BANK_STATEMENTS, [n, ...stmts]); return n;
}
export function updateBankStatement(id: string, u: Partial<BankStatement>): void {
  write(KEYS.BANK_STATEMENTS, getBankStatements().map(s => s.id === id ? { ...s, ...u } : s));
}

// ─── Bank Transactions ────────────────────────────────────────────────────────
export function getBankTransactions(): BankTransaction[] { return read<BankTransaction[]>(KEYS.BANK_TRANSACTIONS, []); }
export function getBankTransactionsByStatement(sid: string): BankTransaction[] { return getBankTransactions().filter(t => t.statement_id === sid); }
export function addBankTransactions(txns: Omit<BankTransaction, 'id'>[]): BankTransaction[] {
  const existing = getBankTransactions();
  const newTxns: BankTransaction[] = txns.map(t => ({ ...t, id: crypto.randomUUID() }));
  write(KEYS.BANK_TRANSACTIONS, [...newTxns, ...existing]); return newTxns;
}
export function updateBankTransaction(id: string, u: Partial<BankTransaction>): void {
  write(KEYS.BANK_TRANSACTIONS, getBankTransactions().map(t => t.id === id ? { ...t, ...u } : t));
}
export function deleteBankTransaction(id: string): void {
  write(KEYS.BANK_TRANSACTIONS, getBankTransactions().filter(t => t.id !== id));
}

// ─── Cash Transactions ────────────────────────────────────────────────────────
export function getCashTransactions(): CashTransaction[] { return read<CashTransaction[]>(KEYS.CASH_TRANSACTIONS, []); }
export function addCashTransaction(t: Omit<CashTransaction, 'id'>): CashTransaction {
  const n: CashTransaction = { ...t, id: crypto.randomUUID() };
  write(KEYS.CASH_TRANSACTIONS, [n, ...getCashTransactions()]); return n;
}
export function updateCashTransaction(id: string, u: Partial<CashTransaction>): void {
  write(KEYS.CASH_TRANSACTIONS, getCashTransactions().map(t => t.id === id ? { ...t, ...u } : t));
}
export function deleteCashTransaction(id: string): void {
  write(KEYS.CASH_TRANSACTIONS, getCashTransactions().filter(t => t.id !== id));
}

// ─── Cash Balance Log ─────────────────────────────────────────────────────────
export function getCashBalanceLog(): CashBalanceLog[] { return read<CashBalanceLog[]>(KEYS.CASH_BALANCE_LOG, []); }
export function addCashBalanceLog(e: Omit<CashBalanceLog, 'id'>): CashBalanceLog {
  const n: CashBalanceLog = { ...e, id: crypto.randomUUID() };
  write(KEYS.CASH_BALANCE_LOG, [n, ...getCashBalanceLog()]); return n;
}

// ─── Categories ───────────────────────────────────────────────────────────────
export function getCategories(): Category[] { return read<Category[]>(KEYS.CATEGORIES, []); }
export function addCategory(c: Omit<Category, 'id'>): Category {
  const n: Category = { ...c, id: crypto.randomUUID() };
  write(KEYS.CATEGORIES, [...getCategories(), n]); return n;
}
export function updateCategory(id: string, u: Partial<Category>): void {
  write(KEYS.CATEGORIES, getCategories().map(c => c.id === id ? { ...c, ...u } : c));
}
export function deleteCategory(id: string): void {
  write(KEYS.CATEGORIES, getCategories().filter(c => c.id !== id));
}

// ─── Narration Map ────────────────────────────────────────────────────────────
export function getNarrationMap(): NarrationCategoryMap[] { return read<NarrationCategoryMap[]>(KEYS.NARRATION_MAP, []); }
export function upsertNarrationMap(pattern: string, category_id: string): void {
  const map = getNarrationMap();
  const existing = map.find(m => m.narration_pattern === pattern);
  if (existing) {
    write(KEYS.NARRATION_MAP, map.map(m => m.narration_pattern === pattern ? { ...m, category_id, confidence: 1 } : m));
  } else {
    write(KEYS.NARRATION_MAP, [...map, { id: crypto.randomUUID(), narration_pattern: pattern, category_id, confidence: 1 }]);
  }
}

// ─── Verticals ────────────────────────────────────────────────────────────────
export function getVerticals(): ClientVertical[] { return read<ClientVertical[]>(KEYS.VERTICALS, []); }
export function addVertical(v: Omit<ClientVertical, 'is_custom'>): ClientVertical {
  const n: ClientVertical = { ...v, is_custom: true };
  write(KEYS.VERTICALS, [...getVerticals(), n]); return n;
}
export function deleteVertical(id: string): void {
  write(KEYS.VERTICALS, getVerticals().filter(v => v.id !== id));
}

// ─── Clients ──────────────────────────────────────────────────────────────────
export function getClients(): Client[] { return read<Client[]>(KEYS.CLIENTS, []); }
export function addClient(c: Omit<Client, 'id'>): Client {
  const n: Client = { ...c, id: crypto.randomUUID() };
  write(KEYS.CLIENTS, [...getClients(), n]); return n;
}
export function updateClient(id: string, u: Partial<Client>): void {
  write(KEYS.CLIENTS, getClients().map(c => c.id === id ? { ...c, ...u } : c));
}
export function deleteClient(id: string): void {
  write(KEYS.CLIENTS, getClients().filter(c => c.id !== id));
}

// ─── Client Monthly Costs ─────────────────────────────────────────────────────
export function getClientMonthlyCosts(): ClientMonthlyCost[] { return read<ClientMonthlyCost[]>(KEYS.CLIENT_MONTHLY_COSTS, []); }
export function getClientMonthlyCost(clientId: string, month: string): ClientMonthlyCost | null {
  return getClientMonthlyCosts().find(c => c.client_id === clientId && c.month === month) || null;
}
export function upsertClientMonthlyCost(cost: Omit<ClientMonthlyCost, 'id'> & { id?: string }): ClientMonthlyCost {
  const all = getClientMonthlyCosts();
  const existing = all.find(c => c.client_id === cost.client_id && c.month === cost.month);
  if (existing) {
    const updated = { ...existing, ...cost, id: existing.id };
    write(KEYS.CLIENT_MONTHLY_COSTS, all.map(c => c.id === existing.id ? updated : c));
    return updated;
  }
  const n: ClientMonthlyCost = { ...cost, id: crypto.randomUUID() };
  write(KEYS.CLIENT_MONTHLY_COSTS, [...all, n]); return n;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
export function getInvoices(): Invoice[] { return read<Invoice[]>(KEYS.INVOICES, []); }
export function getInvoicesByClient(clientId: string): Invoice[] { return getInvoices().filter(i => i.client_id === clientId); }
export function addInvoice(i: Omit<Invoice, 'id'>): Invoice {
  const n: Invoice = { ...i, id: crypto.randomUUID() };
  write(KEYS.INVOICES, [n, ...getInvoices()]); return n;
}
export function updateInvoice(id: string, u: Partial<Invoice>): void {
  write(KEYS.INVOICES, getInvoices().map(i => i.id === id ? { ...i, ...u } : i));
}
export function deleteInvoice(id: string): void {
  write(KEYS.INVOICES, getInvoices().filter(i => i.id !== id));
}

// ─── Invoice Settings ─────────────────────────────────────────────────────────
export function getInvoiceSettings(): InvoiceSettings | null { return read<InvoiceSettings | null>(KEYS.INVOICE_SETTINGS, null); }
export function setInvoiceSettings(s: InvoiceSettings): void { write(KEYS.INVOICE_SETTINGS, s); }

// ─── Team Members ─────────────────────────────────────────────────────────────
export function getTeamMembers(): TeamMember[] { return read<TeamMember[]>(KEYS.TEAM_MEMBERS, []); }
export function addTeamMember(m: Omit<TeamMember, 'id'>): TeamMember {
  const n: TeamMember = { ...m, id: crypto.randomUUID() };
  write(KEYS.TEAM_MEMBERS, [...getTeamMembers(), n]); return n;
}
export function updateTeamMember(id: string, u: Partial<TeamMember>): void {
  write(KEYS.TEAM_MEMBERS, getTeamMembers().map(m => m.id === id ? { ...m, ...u } : m));
}
export function deleteTeamMember(id: string): void {
  write(KEYS.TEAM_MEMBERS, getTeamMembers().filter(m => m.id !== id));
}

// ─── Expense Attributions ─────────────────────────────────────────────────────
export function getExpenseAttributions(): ExpenseAttribution[] { return read<ExpenseAttribution[]>(KEYS.EXPENSE_ATTRIBUTIONS, []); }
export function addExpenseAttribution(a: Omit<ExpenseAttribution, 'id' | 'created_at'>): ExpenseAttribution {
  const n: ExpenseAttribution = { ...a, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  write(KEYS.EXPENSE_ATTRIBUTIONS, [...getExpenseAttributions(), n]); return n;
}
export function updateExpenseAttribution(id: string, u: Partial<ExpenseAttribution>): void {
  write(KEYS.EXPENSE_ATTRIBUTIONS, getExpenseAttributions().map(a => a.id === id ? { ...a, ...u } : a));
}
export function getAttributionsByClient(clientId: string): ExpenseAttribution[] {
  return getExpenseAttributions().filter(a => a.client_id === clientId);
}
export function getAttributionsByMonth(month: string): ExpenseAttribution[] {
  return getExpenseAttributions().filter(a => a.month === month);
}

// ─── Tax ──────────────────────────────────────────────────────────────────────
export function getTaxSettings(): TaxSettings | null { return read<TaxSettings | null>(KEYS.TAX_SETTINGS, null); }
export function setTaxSettings(s: TaxSettings): void { write(KEYS.TAX_SETTINGS, s); }
export function getTaxSummaries(): TaxSummaryMonthly[] { return read<TaxSummaryMonthly[]>(KEYS.TAX_SUMMARIES, []); }
export function upsertTaxSummary(s: Omit<TaxSummaryMonthly, 'id'>): void {
  const all = getTaxSummaries();
  const existing = all.find(x => x.month === s.month);
  if (existing) { write(KEYS.TAX_SUMMARIES, all.map(x => x.month === s.month ? { ...x, ...s } : x)); }
  else { write(KEYS.TAX_SUMMARIES, [...all, { ...s, id: crypto.randomUUID() }]); }
}

// ─── Finance Guru ─────────────────────────────────────────────────────────────
export function getGuruConversations(): GuruConversation[] { return read<GuruConversation[]>(KEYS.GURU_CONVERSATIONS, []); }
export function addGuruConversation(c: Omit<GuruConversation, 'id'>): GuruConversation {
  const n: GuruConversation = { ...c, id: crypto.randomUUID() };
  write(KEYS.GURU_CONVERSATIONS, [n, ...getGuruConversations()]); return n;
}
export function updateGuruConversation(id: string, u: Partial<GuruConversation>): void {
  write(KEYS.GURU_CONVERSATIONS, getGuruConversations().map(c => c.id === id ? { ...c, ...u } : c));
}
export function getGuruMessages(convId: string): GuruMessage[] {
  return read<GuruMessage[]>(KEYS.GURU_MESSAGES, []).filter(m => m.conversation_id === convId);
}
export function addGuruMessage(m: Omit<GuruMessage, 'id'>): GuruMessage {
  const n: GuruMessage = { ...m, id: crypto.randomUUID() };
  const all = read<GuruMessage[]>(KEYS.GURU_MESSAGES, []);
  write(KEYS.GURU_MESSAGES, [...all, n]); return n;
}
export function updateGuruMessage(id: string, u: Partial<GuruMessage>): void {
  const all = read<GuruMessage[]>(KEYS.GURU_MESSAGES, []);
  write(KEYS.GURU_MESSAGES, all.map(m => m.id === id ? { ...m, ...u } : m));
}

// ─── App Settings ─────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: AppSettings = {
  cash_opening_balance: 0,
  cash_holder: 'Shlok',
  quick_entries: [
    { id: '1', label: 'Office Cafe', type: 'Cash Out', amount: 500, category_id: '', description: 'Office cafe' },
    { id: '2', label: 'Auto Fare', type: 'Cash Out', amount: 100, category_id: '', description: 'Auto fare' },
  ],
  founder_salaries: [
    { name: 'Shlok', monthly_amount: 0, active: true },
    { name: 'Tanay', monthly_amount: 0, active: true },
    { name: 'Arihant', monthly_amount: 0, active: true },
  ],
};
export function getAppSettings(): AppSettings { return read<AppSettings>(KEYS.APP_SETTINGS, DEFAULT_SETTINGS); }
export function updateAppSettings(u: Partial<AppSettings>): void {
  write(KEYS.APP_SETTINGS, { ...getAppSettings(), ...u });
}

// ─── Computed ─────────────────────────────────────────────────────────────────
export function computeCashBalance(): number {
  const settings = getAppSettings();
  const txns = getCashTransactions();
  return txns.reduce((bal, t) => t.type === 'Cash In' ? bal + t.amount : bal - t.amount, settings.cash_opening_balance);
}

// ─── Backup & Restore ─────────────────────────────────────────────────────────
export function exportAllData(): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  Object.entries(KEYS).forEach(([name, key]) => { data[name] = read(key, null); });
  return data;
}
export function importAllData(data: Record<string, unknown>): void {
  const keyMap = Object.entries(KEYS).reduce((acc, [name, key]) => ({ ...acc, [name]: key }), {} as Record<string, string>);
  Object.entries(data).forEach(([name, value]) => { if (keyMap[name] && value !== null) write(keyMap[name], value); });
}
export function clearAllData(): void {
  Object.values(KEYS).forEach(key => localStorage.removeItem(key));
}
