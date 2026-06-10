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
  vertical?: string;
  tags: string[];
  notes?: string;
  reason?: string;
  client_id?: string;
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
  reason?: string;
  vertical?: string;
  tags: string[];
  receipt_url?: string;
  client_id?: string;
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
  description?: string;
}

export interface NarrationCategoryMap {
  id: string;
  narration_pattern: string;
  category_id: string;
  confidence: number;
}

// ─── Verticals (custom) ────────────────────────────────────────────────────────

export interface ClientVertical {
  id: string;       // slug e.g. 'restaurants'
  label: string;    // display e.g. 'Restaurants'
  is_custom: boolean;
}

// ─── Clients & Invoices ───────────────────────────────────────────────────────

export type BillingCycle = 'monthly' | 'quarterly' | 'one-off';
export type PaymentMethod = 'UPI' | 'Bank Transfer' | 'Cash' | 'Cheque';
export type ClientStatus = 'active' | 'inactive' | 'paused';

export interface Client {
  id: string;
  name: string;
  vertical: string;           // vertical id
  retainer_amount: number;
  billing_cycle: BillingCycle;
  payment_method: PaymentMethod;
  gstin?: string;
  contact: string;
  start_date: string;
  status: ClientStatus;
  // Fixed cost line items as a template for each month
  fixed_cost_items: ClientCostItem[];
}

export interface ClientCostItem {
  id: string;
  label: string;           // "Shoot", "Editor Fee", "Content Manager"
  estimated_amount: number;
  category_id: string;
  is_variable: boolean;    // true = amount can differ month to month
}

// Monthly actual cost sheet per client
export interface ClientMonthlyCost {
  id: string;
  client_id: string;
  month: string;           // YYYY-MM
  line_items: ClientMonthlyCostLine[];
  total_cost: number;
  notes?: string;
}

export interface ClientMonthlyCostLine {
  id: string;
  label: string;
  planned_amount: number;
  actual_amount: number;
  category_id: string;
  transaction_ids: string[];  // linked bank/cash txn ids
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

// ─── Team & Vendors ───────────────────────────────────────────────────────────

export type TeamMemberType = 'employee' | 'freelancer' | 'vendor';

export interface TeamMember {
  id: string;
  name: string;
  type: TeamMemberType;
  role: string;
  monthly_cost: number;     // salary or avg monthly spend
  client_allocations: TeamClientAllocation[];  // how cost splits across clients
  skills: string[];
  contact?: string;
  active: boolean;
  joined_date: string;
  notes?: string;
}

export interface TeamClientAllocation {
  client_id: string;
  percentage: number;   // 0-100, must sum to ≤100 (rest = overhead)
}

// ─── Invoice Settings ─────────────────────────────────────────────────────────

export interface InvoiceSettings {
  company_name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  pan: string;
  phone: string;
  email: string;
  bank_name: string;
  account_no: string;
  ifsc: string;
  account_holder: string;
  logo_base64?: string;
  footer_note?: string;
  payment_terms?: string;
}

// ─── Expense Attributions (smart linking) ─────────────────────────────────────

export interface ExpenseAttribution {
  id: string;
  transaction_id: string;
  transaction_type: 'bank' | 'cash';
  client_id: string;
  month: string;
  amount: number;
  label: string;
  confirmed: boolean;
  created_at: string;
}

// ─── Tax ──────────────────────────────────────────────────────────────────────

export type BusinessStructure = 'sole_proprietorship' | 'partnership' | 'llp' | 'pvt_ltd';

export interface TaxSettings {
  id: string;
  business_structure: BusinessStructure;
  gstin: string;
  pan: string;
  fy_start: string;
  gst_rate: number;
  state: string;
}

export interface TaxSummaryMonthly {
  id: string;
  month: string;
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
  cash_holder_custom?: string;
  quick_entries: QuickEntry[];
  tax_settings?: TaxSettings;
  founder_salaries?: FounderSalary[];
}

export interface QuickEntry {
  id: string;
  label: string;
  type: CashType;
  amount: number;
  category_id: string;
  description: string;
}

export interface FounderSalary {
  name: string;
  monthly_amount: number;
  active: boolean;
}
