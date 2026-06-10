-- ============================================================================
-- Respawn Finance — Supabase Schema
-- Run this entire file in Supabase SQL Editor to create all tables.
-- ============================================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ─── Audit Log ──────────────────────────────────────────────────────────────
create table audit_log (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb,
  timestamp timestamptz default now()
);
create index audit_log_timestamp_idx on audit_log (timestamp desc);

-- ─── Bank Statements ────────────────────────────────────────────────────────
create table bank_statements (
  id uuid primary key default uuid_generate_v4(),
  bank_name text not null,
  statement_month text not null,
  file_url text,
  status text not null check (status in ('processing', 'review', 'committed', 'error')),
  uploaded_at timestamptz default now()
);

-- ─── Bank Transactions ──────────────────────────────────────────────────────
create table bank_transactions (
  id uuid primary key default uuid_generate_v4(),
  statement_id uuid references bank_statements(id) on delete cascade,
  date date not null,
  narration text not null,
  debit numeric default 0,
  credit numeric default 0,
  balance numeric default 0,
  ref_no text,
  category_id uuid,
  vertical text,
  tags text[] default '{}',
  notes text,
  reason text,
  client_id uuid,
  confidence_score numeric,
  linked_invoice_id uuid
);
create index bank_txn_date_idx on bank_transactions (date desc);
create index bank_txn_statement_idx on bank_transactions (statement_id);
create index bank_txn_client_idx on bank_transactions (client_id);
create index bank_txn_category_idx on bank_transactions (category_id);

-- ─── Cash Transactions ──────────────────────────────────────────────────────
create table cash_transactions (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  type text not null check (type in ('Cash In', 'Cash Out')),
  amount numeric not null,
  category_id uuid,
  party text not null,
  description text,
  reason text,
  vertical text,
  tags text[] default '{}',
  receipt_url text,
  client_id uuid,
  created_by text default 'founder',
  created_at timestamptz default now()
);
create index cash_txn_date_idx on cash_transactions (date desc);
create index cash_txn_client_idx on cash_transactions (client_id);
create index cash_txn_category_idx on cash_transactions (category_id);

-- ─── Cash Balance Log ───────────────────────────────────────────────────────
create table cash_balance_log (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  calculated_balance numeric not null,
  counted_balance numeric not null,
  variance numeric not null,
  holder text not null,
  notes text,
  created_at timestamptz default now()
);

-- ─── Categories ─────────────────────────────────────────────────────────────
create table categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null check (type in ('income', 'expense', 'both')),
  is_custom boolean default false,
  description text,
  created_at timestamptz default now()
);

-- ─── Narration → Category map ───────────────────────────────────────────────
create table narration_map (
  id uuid primary key default uuid_generate_v4(),
  narration_pattern text not null unique,
  category_id uuid references categories(id) on delete cascade,
  confidence numeric default 1
);

-- ─── Verticals ──────────────────────────────────────────────────────────────
create table verticals (
  id text primary key,
  label text not null,
  is_custom boolean default false,
  created_at timestamptz default now()
);

-- ─── Clients ────────────────────────────────────────────────────────────────
create table clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  vertical text references verticals(id),
  retainer_amount numeric default 0,
  billing_cycle text check (billing_cycle in ('monthly', 'quarterly', 'one-off')),
  payment_method text check (payment_method in ('UPI', 'Bank Transfer', 'Cash', 'Cheque')),
  gstin text,
  contact text,
  start_date date,
  status text check (status in ('active', 'inactive', 'paused')),
  fixed_cost_items jsonb default '[]',
  created_at timestamptz default now()
);

-- ─── Client Monthly Costs ───────────────────────────────────────────────────
create table client_monthly_costs (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  month text not null,
  line_items jsonb not null default '[]',
  total_cost numeric default 0,
  notes text,
  updated_at timestamptz default now(),
  unique (client_id, month)
);
create index client_monthly_cost_idx on client_monthly_costs (client_id, month);

-- ─── Invoices ───────────────────────────────────────────────────────────────
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  invoice_no text not null,
  invoice_date date not null,
  due_date date not null,
  amount numeric not null,
  gst_amount numeric default 0,
  total numeric not null,
  status text check (status in ('Draft', 'Sent', 'Paid', 'Partially Paid', 'Overdue')),
  linked_transaction_id uuid,
  notes text,
  created_at timestamptz default now()
);
create index invoice_client_idx on invoices (client_id);
create index invoice_date_idx on invoices (invoice_date desc);

-- ─── Invoice Settings (singleton table) ─────────────────────────────────────
create table invoice_settings (
  id integer primary key default 1 check (id = 1),
  company_name text,
  address text,
  city text,
  state text,
  pincode text,
  gstin text,
  pan text,
  phone text,
  email text,
  bank_name text,
  account_no text,
  ifsc text,
  account_holder text,
  logo_base64 text,
  footer_note text,
  payment_terms text,
  updated_at timestamptz default now()
);

-- ─── Team Members & Vendors ─────────────────────────────────────────────────
create table team_members (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text check (type in ('employee', 'freelancer', 'vendor')),
  role text,
  monthly_cost numeric default 0,
  client_allocations jsonb default '[]',
  skills text[] default '{}',
  contact text,
  active boolean default true,
  joined_date date,
  notes text,
  created_at timestamptz default now()
);

-- ─── Expense Attributions ───────────────────────────────────────────────────
create table expense_attributions (
  id uuid primary key default uuid_generate_v4(),
  transaction_id uuid not null,
  transaction_type text check (transaction_type in ('bank', 'cash')),
  client_id uuid references clients(id) on delete cascade,
  month text not null,
  amount numeric not null,
  label text,
  confirmed boolean default false,
  created_at timestamptz default now()
);
create index attr_client_idx on expense_attributions (client_id);
create index attr_month_idx on expense_attributions (month);

-- ─── Tax ────────────────────────────────────────────────────────────────────
create table tax_settings (
  id integer primary key default 1 check (id = 1),
  business_structure text check (business_structure in ('sole_proprietorship', 'partnership', 'llp', 'pvt_ltd')),
  gstin text,
  pan text,
  fy_start text default 'April',
  gst_rate numeric default 18,
  state text,
  updated_at timestamptz default now()
);

create table tax_summaries (
  id uuid primary key default uuid_generate_v4(),
  month text unique not null,
  gst_out numeric default 0,
  gst_in numeric default 0,
  gst_net numeric default 0,
  tds_receivable numeric default 0,
  tds_payable numeric default 0,
  prof_tax numeric default 0,
  advance_tax_est numeric default 0
);

-- ─── Finance Guru ───────────────────────────────────────────────────────────
create table guru_conversations (
  id uuid primary key default uuid_generate_v4(),
  title text,
  started_at timestamptz default now()
);

create table guru_messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references guru_conversations(id) on delete cascade,
  role text check (role in ('user', 'assistant')),
  content text not null,
  starred boolean default false,
  timestamp timestamptz default now()
);
create index guru_msg_conv_idx on guru_messages (conversation_id, timestamp);

-- ─── App Settings (singleton) ───────────────────────────────────────────────
create table app_settings (
  id integer primary key default 1 check (id = 1),
  cash_opening_balance numeric default 0,
  cash_holder text default 'Shlok',
  cash_holder_custom text,
  quick_entries jsonb default '[]',
  founder_salaries jsonb default '[]',
  updated_at timestamptz default now()
);

-- ─── Row Level Security ─────────────────────────────────────────────────────
-- Enable RLS on all tables, restricting access to authenticated users.
-- For now: any authenticated user can read/write (since this is internal only).
-- Tighten later if you add per-user permissions.

alter table audit_log enable row level security;
alter table bank_statements enable row level security;
alter table bank_transactions enable row level security;
alter table cash_transactions enable row level security;
alter table cash_balance_log enable row level security;
alter table categories enable row level security;
alter table narration_map enable row level security;
alter table verticals enable row level security;
alter table clients enable row level security;
alter table client_monthly_costs enable row level security;
alter table invoices enable row level security;
alter table invoice_settings enable row level security;
alter table team_members enable row level security;
alter table expense_attributions enable row level security;
alter table tax_settings enable row level security;
alter table tax_summaries enable row level security;
alter table guru_conversations enable row level security;
alter table guru_messages enable row level security;
alter table app_settings enable row level security;

-- Authenticated users can do everything
do $$ declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('create policy "auth_all" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');', t);
  end loop;
end $$;
