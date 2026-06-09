// ─── Users & Audit ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: 'founder';
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity: string;
  entity_id?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ─── Bank ─────────────────────────────────────────────────────────────────────

export type BankStatementStatus = 'processing' | 'review' | 'committed' | 'error';

export interface BankStatement {
  id: string;
  bank_name: string;
  statement_month: string; // YYYY-MM
  file_url?: string;
  uploaded_at: string;
  status: BankStatementStatus;
}

export interface BankTransaction {
  id: string;
  statement_id: string;
  date: string;
  narration: string;
  debit: number;
  credit: number;
  balance: number;
  ref_no?: string;
  category_id: string;
  vertical?: Vertical;
  tags: string[];
  notes?: string;
  confidence_score?: number;
  linked_invoice_id?: string;
}

// ─── Cash ─────────────────────────────────────────────────────────────────────

export type CashType = 'Cash In' | 'Cash Out';

export interface CashTransaction {
  id: string;
  date: string;
  type: CashType;
  amount: number;
  category_id: string;
  party: string;
  description: string;
  vertical?: Vertical;
  tags: string[];
  receipt_url?: string;
  created_by: string;
}

export interface CashBalanceLog {
  id: string;
  date: string;
  calculated_balance: number;
  counted_balance: number;
  variance: number;
  holder: string;
  notes?: string;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export type CategoryType = 'income' | 'expense' | 'both';

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  is_custom: boolean;
}

export interface NarrationCategoryMap {
  id: string;
  narration_pattern: string;
  category_id: string;
  confidence: number;
}

// ─── Clients & Invoices ───────────────────────────────────────────────────────

export type Vertical = 'restaurants' | 'menswear' | 'weddings' | 'other';
export type BillingCycle = 'monthly' | 'quarterly' | 'one-off';
export type PaymentMethod = 'UPI' | 'Bank Transfer' | 'Cash' | 'Cheque';
export type ClientStatus = 'active' | 'inactive' | 'paused';

export interface Client {
  id: string;
  name: string;
  vertical: Vertical;
  retainer_amount: number;
  billing_cycle: BillingCycle;
  payment_method: PaymentMethod;
  gstin?: string;
  contact: string;
  start_date: string;
  status: ClientStatus;
}

export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Partially Paid' | 'Overdue';

export interface Invoice {
  id: string;
  client_id: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  gst_amount: number;
  total: number;
  status: InvoiceStatus;
  linked_transaction_id?: string;
  notes?: string;
}

// ─── Tax ──────────────────────────────────────────────────────────────────────

export type BusinessStructure = 'sole_proprietorship' | 'partnership' | 'llp' | 'pvt_ltd';

export interface TaxSettings {
  id: string;
  business_structure: BusinessStructure;
  gstin: string;
  pan: string;
  fy_start: string; // 'April'
  gst_rate: number; // 18
  state: string;
}

export interface TaxSummaryMonthly {
  id: string;
  month: string; // YYYY-MM
  gst_out: number;
  gst_in: number;
  gst_net: number;
  tds_receivable: number;
  tds_payable: number;
  prof_tax: number;
  advance_tax_est: number;
}

// ─── Finance Guru ─────────────────────────────────────────────────────────────

export interface GuruConversation {
  id: string;
  started_at: string;
  title: string;
}

export interface GuruMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  starred: boolean;
}

// ─── App State ────────────────────────────────────────────────────────────────

export interface AppSettings {
  cash_opening_balance: number;
  cash_holder: string;
  quick_entries: QuickEntry[];
  tax_settings?: TaxSettings;
}

export interface QuickEntry {
  id: string;
  label: string;
  type: CashType;
  amount: number;
  category_id: string;
  description: string;
}
