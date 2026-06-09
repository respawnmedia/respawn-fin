/**
 * Respawn Finance — Storage Abstraction Layer
 *
 * ALL data access goes through this module. No component ever touches
 * localStorage directly. Phase 2: swap the implementation here to Supabase
 * client calls — the interface stays identical, components are untouched.
 */

import type {
  AuditLog,
  BankStatement,
  BankTransaction,
  CashTransaction,
  CashBalanceLog,
  Category,
  NarrationCategoryMap,
  Client,
  Invoice,
  TaxSettings,
  TaxSummaryMonthly,
  GuruConversation,
  GuruMessage,
  AppSettings,
} from '@/types';

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const KEYS = {
  AUDIT_LOG: 'respawn-finance:audit_log',
  BANK_STATEMENTS: 'respawn-finance:bank_statements',
  BANK_TRANSACTIONS: 'respawn-finance:bank_transactions',
  CASH_TRANSACTIONS: 'respawn-finance:cash_transactions',
  CASH_BALANCE_LOG: 'respawn-finance:cash_balance_log',
  CATEGORIES: 'respawn-finance:categories',
  NARRATION_MAP: 'respawn-finance:narration_map',
  CLIENTS: 'respawn-finance:clients',
  INVOICES: 'respawn-finance:invoices',
  TAX_SETTINGS: 'respawn-finance:tax_settings',
  TAX_SUMMARIES: 'respawn-finance:tax_summaries',
  GURU_CONVERSATIONS: 'respawn-finance:guru_conversations',
  GURU_MESSAGES: 'respawn-finance:guru_messages',
  APP_SETTINGS: 'respawn-finance:app_settings',
} as const;

// ─── Core Helpers ─────────────────────────────────────────────────────────────

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export function getAuditLog(): AuditLog[] {
  return read<AuditLog[]>(KEYS.AUDIT_LOG, []);
}

export function addAuditEntry(entry: Omit<AuditLog, 'id' | 'timestamp'>): void {
  const log = getAuditLog();
  log.unshift({ ...entry, id: crypto.randomUUID(), timestamp: new Date().toISOString() });
  // Keep last 1000 entries
  write(KEYS.AUDIT_LOG, log.slice(0, 1000));
}

// ─── Bank Statements ──────────────────────────────────────────────────────────

export function getBankStatements(): BankStatement[] {
  return read<BankStatement[]>(KEYS.BANK_STATEMENTS, []);
}

export function addBankStatement(stmt: Omit<BankStatement, 'id' | 'uploaded_at'>): BankStatement {
  const statements = getBankStatements();
  const newStmt: BankStatement = { ...stmt, id: crypto.randomUUID(), uploaded_at: new Date().toISOString() };
  write(KEYS.BANK_STATEMENTS, [newStmt, ...statements]);
  return newStmt;
}

export function updateBankStatement(id: string, updates: Partial<BankStatement>): void {
  const statements = getBankStatements().map(s => s.id === id ? { ...s, ...updates } : s);
  write(KEYS.BANK_STATEMENTS, statements);
}

// ─── Bank Transactions ────────────────────────────────────────────────────────

export function getBankTransactions(): BankTransaction[] {
  return read<BankTransaction[]>(KEYS.BANK_TRANSACTIONS, []);
}

export function getBankTransactionsByStatement(statementId: string): BankTransaction[] {
  return getBankTransactions().filter(t => t.statement_id === statementId);
}

export function addBankTransactions(txns: Omit<BankTransaction, 'id'>[]): BankTransaction[] {
  const existing = getBankTransactions();
  const newTxns: BankTransaction[] = txns.map(t => ({ ...t, id: crypto.randomUUID() }));
  write(KEYS.BANK_TRANSACTIONS, [...newTxns, ...existing]);
  return newTxns;
}

export function updateBankTransaction(id: string, updates: Partial<BankTransaction>): void {
  const txns = getBankTransactions().map(t => t.id === id ? { ...t, ...updates } : t);
  write(KEYS.BANK_TRANSACTIONS, txns);
}

export function deleteBankTransaction(id: string): void {
  write(KEYS.BANK_TRANSACTIONS, getBankTransactions().filter(t => t.id !== id));
}

// ─── Cash Transactions ────────────────────────────────────────────────────────

export function getCashTransactions(): CashTransaction[] {
  return read<CashTransaction[]>(KEYS.CASH_TRANSACTIONS, []);
}

export function addCashTransaction(txn: Omit<CashTransaction, 'id'>): CashTransaction {
  const existing = getCashTransactions();
  const newTxn: CashTransaction = { ...txn, id: crypto.randomUUID() };
  write(KEYS.CASH_TRANSACTIONS, [newTxn, ...existing]);
  return newTxn;
}

export function updateCashTransaction(id: string, updates: Partial<CashTransaction>): void {
  const txns = getCashTransactions().map(t => t.id === id ? { ...t, ...updates } : t);
  write(KEYS.CASH_TRANSACTIONS, txns);
}

export function deleteCashTransaction(id: string): void {
  write(KEYS.CASH_TRANSACTIONS, getCashTransactions().filter(t => t.id !== id));
}

// ─── Cash Balance Log ─────────────────────────────────────────────────────────

export function getCashBalanceLog(): CashBalanceLog[] {
  return read<CashBalanceLog[]>(KEYS.CASH_BALANCE_LOG, []);
}

export function addCashBalanceLog(entry: Omit<CashBalanceLog, 'id'>): CashBalanceLog {
  const log = getCashBalanceLog();
  const newEntry: CashBalanceLog = { ...entry, id: crypto.randomUUID() };
  write(KEYS.CASH_BALANCE_LOG, [newEntry, ...log]);
  return newEntry;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export function getCategories(): Category[] {
  return read<Category[]>(KEYS.CATEGORIES, []);
}

export function addCategory(cat: Omit<Category, 'id'>): Category {
  const cats = getCategories();
  const newCat: Category = { ...cat, id: crypto.randomUUID() };
  write(KEYS.CATEGORIES, [...cats, newCat]);
  return newCat;
}

export function updateCategory(id: string, updates: Partial<Category>): void {
  write(KEYS.CATEGORIES, getCategories().map(c => c.id === id ? { ...c, ...updates } : c));
}

export function deleteCategory(id: string): void {
  write(KEYS.CATEGORIES, getCategories().filter(c => c.id !== id));
}

// ─── Narration → Category Map ─────────────────────────────────────────────────

export function getNarrationMap(): NarrationCategoryMap[] {
  return read<NarrationCategoryMap[]>(KEYS.NARRATION_MAP, []);
}

export function upsertNarrationMap(pattern: string, category_id: string): void {
  const map = getNarrationMap();
  const existing = map.find(m => m.narration_pattern === pattern);
  if (existing) {
    write(KEYS.NARRATION_MAP, map.map(m => m.narration_pattern === pattern ? { ...m, category_id, confidence: 1 } : m));
  } else {
    write(KEYS.NARRATION_MAP, [...map, { id: crypto.randomUUID(), narration_pattern: pattern, category_id, confidence: 1 }]);
  }
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export function getClients(): Client[] {
  return read<Client[]>(KEYS.CLIENTS, []);
}

export function addClient(client: Omit<Client, 'id'>): Client {
  const clients = getClients();
  const newClient: Client = { ...client, id: crypto.randomUUID() };
  write(KEYS.CLIENTS, [...clients, newClient]);
  return newClient;
}

export function updateClient(id: string, updates: Partial<Client>): void {
  write(KEYS.CLIENTS, getClients().map(c => c.id === id ? { ...c, ...updates } : c));
}

export function deleteClient(id: string): void {
  write(KEYS.CLIENTS, getClients().filter(c => c.id !== id));
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export function getInvoices(): Invoice[] {
  return read<Invoice[]>(KEYS.INVOICES, []);
}

export function getInvoicesByClient(clientId: string): Invoice[] {
  return getInvoices().filter(i => i.client_id === clientId);
}

export function addInvoice(invoice: Omit<Invoice, 'id'>): Invoice {
  const invoices = getInvoices();
  const newInvoice: Invoice = { ...invoice, id: crypto.randomUUID() };
  write(KEYS.INVOICES, [newInvoice, ...invoices]);
  return newInvoice;
}

export function updateInvoice(id: string, updates: Partial<Invoice>): void {
  write(KEYS.INVOICES, getInvoices().map(i => i.id === id ? { ...i, ...updates } : i));
}

export function deleteInvoice(id: string): void {
  write(KEYS.INVOICES, getInvoices().filter(i => i.id !== id));
}

// ─── Tax ──────────────────────────────────────────────────────────────────────

export function getTaxSettings(): TaxSettings | null {
  return read<TaxSettings | null>(KEYS.TAX_SETTINGS, null);
}

export function setTaxSettings(settings: TaxSettings): void {
  write(KEYS.TAX_SETTINGS, settings);
}

export function getTaxSummaries(): TaxSummaryMonthly[] {
  return read<TaxSummaryMonthly[]>(KEYS.TAX_SUMMARIES, []);
}

export function upsertTaxSummary(summary: Omit<TaxSummaryMonthly, 'id'>): void {
  const summaries = getTaxSummaries();
  const existing = summaries.find(s => s.month === summary.month);
  if (existing) {
    write(KEYS.TAX_SUMMARIES, summaries.map(s => s.month === summary.month ? { ...s, ...summary } : s));
  } else {
    write(KEYS.TAX_SUMMARIES, [...summaries, { ...summary, id: crypto.randomUUID() }]);
  }
}

// ─── Finance Guru ─────────────────────────────────────────────────────────────

export function getGuruConversations(): GuruConversation[] {
  return read<GuruConversation[]>(KEYS.GURU_CONVERSATIONS, []);
}

export function addGuruConversation(conv: Omit<GuruConversation, 'id'>): GuruConversation {
  const convs = getGuruConversations();
  const newConv: GuruConversation = { ...conv, id: crypto.randomUUID() };
  write(KEYS.GURU_CONVERSATIONS, [newConv, ...convs]);
  return newConv;
}

export function updateGuruConversation(id: string, updates: Partial<GuruConversation>): void {
  write(KEYS.GURU_CONVERSATIONS, getGuruConversations().map(c => c.id === id ? { ...c, ...updates } : c));
}

export function getGuruMessages(conversationId: string): GuruMessage[] {
  return read<GuruMessage[]>(KEYS.GURU_MESSAGES, []).filter(m => m.conversation_id === conversationId);
}

export function addGuruMessage(msg: Omit<GuruMessage, 'id'>): GuruMessage {
  const msgs = read<GuruMessage[]>(KEYS.GURU_MESSAGES, []);
  const newMsg: GuruMessage = { ...msg, id: crypto.randomUUID() };
  write(KEYS.GURU_MESSAGES, [...msgs, newMsg]);
  return newMsg;
}

export function updateGuruMessage(id: string, updates: Partial<GuruMessage>): void {
  const msgs = read<GuruMessage[]>(KEYS.GURU_MESSAGES, []);
  write(KEYS.GURU_MESSAGES, msgs.map(m => m.id === id ? { ...m, ...updates } : m));
}

// ─── App Settings ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  cash_opening_balance: 0,
  cash_holder: 'Shlok',
  quick_entries: [
    { id: '1', label: 'Office Cafe', type: 'Cash Out', amount: 500, category_id: 'food-cafes', description: 'Office cafe' },
    { id: '2', label: 'Auto Fare', type: 'Cash Out', amount: 100, category_id: 'travel', description: 'Auto fare' },
    { id: '3', label: 'Petty Cash', type: 'Cash In', amount: 1000, category_id: 'petty-cash', description: 'Petty cash refill' },
  ],
};

export function getAppSettings(): AppSettings {
  return read<AppSettings>(KEYS.APP_SETTINGS, DEFAULT_SETTINGS);
}

export function updateAppSettings(updates: Partial<AppSettings>): void {
  write(KEYS.APP_SETTINGS, { ...getAppSettings(), ...updates });
}

// ─── Computed: Cash Balance ───────────────────────────────────────────────────

export function computeCashBalance(): number {
  const settings = getAppSettings();
  const txns = getCashTransactions();
  return txns.reduce((bal, t) => t.type === 'Cash In' ? bal + t.amount : bal - t.amount, settings.cash_opening_balance);
}

// ─── Backup & Restore ─────────────────────────────────────────────────────────

export function exportAllData(): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  Object.entries(KEYS).forEach(([name, key]) => {
    data[name] = read(key, null);
  });
  return data;
}

export function importAllData(data: Record<string, unknown>): void {
  const keyMap = Object.entries(KEYS).reduce((acc, [name, key]) => ({ ...acc, [name]: key }), {} as Record<string, string>);
  Object.entries(data).forEach(([name, value]) => {
    if (keyMap[name] && value !== null) {
      write(keyMap[name], value);
    }
  });
}

export function clearAllData(): void {
  Object.values(KEYS).forEach(key => localStorage.removeItem(key));
}
