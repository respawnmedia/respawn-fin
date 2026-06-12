import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, AlertTriangle, DollarSign, TrendingUp, CreditCard, CheckCircle, Search, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Card, MetricCard } from '@/components/ui/Card';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Badge, InvoiceStatusBadge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import {
  getClients, addClient, updateClient, deleteClient,
  getInvoices, addInvoice, updateInvoice, deleteInvoice,
  getVerticals, addVertical,
  getClientMonthlyCosts, upsertClientMonthlyCost,
  getExpenseAttributions, addExpenseAttribution,
  getCategories, addAuditEntry,
} from '@/lib/storage';
import { getPaymentRecords, addPaymentRecord, deletePaymentRecord, getPaymentsByClient, getTotalPaidByClient, type PaymentRecord } from '@/lib/payments';
import { scanExistingForClientPayments, markScanned, type ScanResult } from '@/lib/scan-existing';
import { formatCurrency, formatDate, generateInvoiceNo, currentMonth, formatMonth } from '@/utils/format';
import type { Client, Invoice, BillingCycle, PaymentMethod, InvoiceStatus, ClientCostItem, ClientMonthlyCostLine } from '@/types';

const BILLING_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'one-off', label: 'One-off' },
];
const PAYMENT_OPTIONS = [
  { value: 'UPI', label: 'UPI' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Cash', label: 'Cash' },
  { value: 'Cheque', label: 'Cheque' },
];
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'paused', label: 'Paused' },
];
const INVOICE_STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: 'Draft', label: 'Draft' },
  { value: 'Sent', label: 'Sent' },
  { value: 'Paid', label: 'Paid' },
  { value: 'Partially Paid', label: 'Partially Paid' },
  { value: 'Overdue', label: 'Overdue' },
];

// -- Scan Result Row ----------------------------------------------------------
interface ScanResultRowProps {
  result: ScanResult;
  isAccepted: boolean;
  onAccept: (result: ScanResult, forMonth: string, mode: PaymentMethod) => void;
}

function ScanResultRow({ result, isAccepted, onAccept }: ScanResultRowProps) {
  const [forMonth, setForMonth] = React.useState(result.date.slice(0, 7));
  const [mode, setMode] = React.useState<PaymentMethod>(result.source === 'bank' ? 'Bank Transfer' : 'Cash');

  if (isAccepted) {
    return (
      <div className="flex items-center gap-3 px-3 py-3 bg-[#f0fdf4] border border-[#bbf7d0]">
        <CheckCircle className="w-4 h-4 text-[#16A34A] flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[#16A34A]">Recorded — {result.client_name}</p>
          <p className="text-xs text-[#888]">{formatCurrency(result.amount)} · {formatMonth(forMonth)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[#e8e8e8] hover:border-[#16C4BA] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm text-[#070707]">{result.client_name}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 ${
              result.confidence === 'high' ? 'bg-[#dcfce7] text-[#16A34A]' : 'bg-[#fef3c7] text-[#d97706]'
            }`}>
              {result.confidence}
            </span>
            <span className="text-[10px] text-[#888] bg-[#f0f0f0] px-1.5 py-0.5">{result.source}</span>
          </div>
          <p className="text-xs text-[#555] break-words leading-snug">{result.narration}</p>
          <p className="text-xs text-[#888] mt-0.5">{formatDate(result.date)} · {result.match_reason}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold tabular-nums text-[#16A34A]">{formatCurrency(result.amount)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#f0f0f0]">
        <select value={forMonth} onChange={e => setForMonth(e.target.value)}
          className="px-2 py-1.5 text-xs border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
          {[0, 1, 2, 3].map(i => {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const m = d.toISOString().slice(0, 7);
            return <option key={m} value={m}>{formatMonth(m)}</option>;
          })}
        </select>
        <select value={mode} onChange={e => setMode(e.target.value as PaymentMethod)}
          className="px-2 py-1.5 text-xs border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
          <option value="Bank Transfer">Bank Transfer</option>
          <option value="UPI">UPI</option>
          <option value="Cash">Cash</option>
          <option value="Cheque">Cheque</option>
        </select>
        <button onClick={() => onAccept(result, forMonth, mode)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#16C4BA] text-[#070707] hover:bg-[#13b0a7]">
          <CheckCircle className="w-3.5 h-3.5" />
          Accept
        </button>
      </div>
    </div>
  );
}


export function ClientPaymentsPage() {
  const toast = useToast();
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<'invoices' | 'costs' | 'payments'>('payments');
  const [clientModal, setClientModal] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState<string | null>(null);
  const [costModal, setCostModal] = useState<{ clientId: string; month: string } | null>(null);
  const [addVerticalModal, setAddVerticalModal] = useState(false);
  const [scanModal, setScanModal] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [paymentModal, setPaymentModal] = useState<string | null>(null); // client id
  const [paymentForm, setPaymentForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    mode: 'Bank Transfer' as PaymentMethod,
    for_month: currentMonth(),
    notes: '',
  });
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newVerticalLabel, setNewVerticalLabel] = useState('');

  const clients = getClients();
  const invoices = getInvoices();
  const verticals = getVerticals();
  const categories = getCategories();
  const monthlyCosts = getClientMonthlyCosts();
  const attributions = getExpenseAttributions();

  const verticalOptions = verticals.map(v => ({ value: v.id, label: v.label }));
  const categoryOptions = categories.map(c => ({ value: c.id, label: c.name }));

  // -- Client form ------------------------------------------------------------
  const emptyClientForm = {
    name: '', vertical: 'restaurants', retainer_amount: '',
    billing_cycle: 'monthly' as BillingCycle, payment_method: 'UPI' as PaymentMethod,
    gstin: '', contact: '', start_date: new Date().toISOString().split('T')[0],
    status: 'active' as Client['status'],
    fixed_cost_items: [] as ClientCostItem[],
  };
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [newCostItem, setNewCostItem] = useState({ label: '', estimated_amount: '', category_id: '', is_variable: false });

  // -- Invoice form -----------------------------------------------------------
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '', amount: '', gst_rate: '18', notes: '', status: 'Sent' as InvoiceStatus,
  });

  // -- Cost sheet form --------------------------------------------------------
  const [costForm, setCostForm] = useState<ClientMonthlyCostLine[]>([]);
  const [costNotes, setCostNotes] = useState('');

  // -- Metrics ---------------------------------------------------------------
  const metrics = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const activeClients = clients.filter(c => c.status === 'active');
    const totalMRR = activeClients.reduce((s, c) => c.billing_cycle === 'monthly' ? s + c.retainer_amount : s, 0);
    const pending = invoices.filter(i => i.status === 'Sent' || i.status === 'Partially Paid');
    const overdue = invoices.filter(i => (i.status === 'Sent' || i.status === 'Partially Paid') && i.due_date < today);

    // Total costs this month
    const thisMonth = currentMonth();
    const monthCosts = monthlyCosts.filter(c => c.month === thisMonth);
    const totalCostThisMonth = monthCosts.reduce((s, c) => s + c.total_cost, 0);

    return {
      totalClients: activeClients.length,
      totalMRR,
      pendingAmount: pending.reduce((s, i) => s + i.total, 0),
      overdueCount: overdue.length,
      totalCostThisMonth,
      netMargin: totalMRR - totalCostThisMonth,
    };
  }, [clients, invoices, monthlyCosts]);

  // -- Vertical management ----------------------------------------------------
  function handleAddVertical() {
    if (!newVerticalLabel.trim()) return;
    const id = newVerticalLabel.trim().toLowerCase().replace(/\s+/g, '_');
    addVertical({ id, label: newVerticalLabel.trim() });
    setNewVerticalLabel('');
    toast(`Vertical "${newVerticalLabel}" added`, 'success');
  }

  // -- Client CRUD ------------------------------------------------------------
  function openAddClient() {
    setClientForm(emptyClientForm);
    setEditingClient(null);
    setClientModal(true);
  }
  function openEditClient(c: Client) {
    setClientForm({
      name: c.name, vertical: c.vertical, retainer_amount: c.retainer_amount.toString(),
      billing_cycle: c.billing_cycle, payment_method: c.payment_method,
      gstin: c.gstin || '', contact: c.contact, start_date: c.start_date,
      status: c.status, fixed_cost_items: c.fixed_cost_items || [],
    });
    setEditingClient(c);
    setClientModal(true);
  }
  function addCostItemToForm() {
    if (!newCostItem.label.trim() || !newCostItem.estimated_amount) return;
    const item: ClientCostItem = {
      id: crypto.randomUUID(), label: newCostItem.label.trim(),
      estimated_amount: Number(newCostItem.estimated_amount),
      category_id: newCostItem.category_id, is_variable: newCostItem.is_variable,
    };
    setClientForm(f => ({ ...f, fixed_cost_items: [...f.fixed_cost_items, item] }));
    setNewCostItem({ label: '', estimated_amount: '', category_id: '', is_variable: false });
  }
  function removeCostItemFromForm(id: string) {
    setClientForm(f => ({ ...f, fixed_cost_items: f.fixed_cost_items.filter(i => i.id !== id) }));
  }
  async function saveClient() {
    if (!clientForm.name.trim()) return;
    setLoading(true);
    const payload: Omit<Client, 'id'> = {
      ...clientForm,
      retainer_amount: Number(clientForm.retainer_amount) || 0,
      fixed_cost_items: clientForm.fixed_cost_items,
    };
    if (editingClient) {
      updateClient(editingClient.id, payload);
      addAuditEntry({ user_id: 'founder', action: 'UPDATE_CLIENT', entity: 'client', entity_id: editingClient.id });
    } else {
      const c = addClient(payload);
      addAuditEntry({ user_id: 'founder', action: 'ADD_CLIENT', entity: 'client', entity_id: c.id });
    }
    toast(editingClient ? 'Client updated' : 'Client added', 'success');
    setLoading(false);
    setClientModal(false);
  }

  // -- Invoice CRUD -----------------------------------------------------------
  function openAddInvoice(clientId: string) {
    setInvoiceForm({ invoice_date: new Date().toISOString().split('T')[0], due_date: '', amount: '', gst_rate: '18', notes: '', status: 'Sent' });
    setEditingInvoice(null);
    setInvoiceModal(clientId);
  }
  function openEditInvoice(inv: Invoice) {
    const gstRate = inv.amount > 0 ? Math.round((inv.gst_amount / inv.amount) * 100) : 18;
    setInvoiceForm({ invoice_date: inv.invoice_date, due_date: inv.due_date, amount: inv.amount.toString(), gst_rate: gstRate.toString(), notes: inv.notes || '', status: inv.status });
    setEditingInvoice(inv);
    setInvoiceModal(inv.client_id);
  }
  async function saveInvoice() {
    if (!invoiceModal || !invoiceForm.amount) return;
    setLoading(true);
    const amount = Number(invoiceForm.amount);
    const gst_amount = amount * (Number(invoiceForm.gst_rate) / 100);
    const payload: Omit<Invoice, 'id'> = {
      client_id: invoiceModal,
      invoice_no: editingInvoice?.invoice_no || generateInvoiceNo(invoices),
      invoice_date: invoiceForm.invoice_date, due_date: invoiceForm.due_date || invoiceForm.invoice_date,
      amount, gst_amount, total: amount + gst_amount, status: invoiceForm.status, notes: invoiceForm.notes,
    };
    if (editingInvoice) { updateInvoice(editingInvoice.id, payload); }
    else { const inv = addInvoice(payload); addAuditEntry({ user_id: 'founder', action: 'ADD_INVOICE', entity: 'invoice', entity_id: inv.id }); }
    toast(editingInvoice ? 'Invoice updated' : 'Invoice created', 'success');
    setLoading(false);
    setInvoiceModal(null);
  }

  // -- Monthly cost sheet -----------------------------------------------------
  function openCostSheet(clientId: string, month: string) {
    const client = clients.find(c => c.id === clientId);
    const existing = monthlyCosts.find(c => c.client_id === clientId && c.month === month);
    if (existing) {
      setCostForm(existing.line_items);
      setCostNotes(existing.notes || '');
    } else if (client) {
      // Pre-fill from client's fixed cost items
      setCostForm((client.fixed_cost_items || []).map(item => ({
        id: item.id,
        label: item.label,
        planned_amount: item.estimated_amount,
        actual_amount: item.estimated_amount,
        category_id: item.category_id,
        transaction_ids: [],
      })));
      setCostNotes('');
    } else {
      setCostForm([]);
      setCostNotes('');
    }
    setCostModal({ clientId, month });
  }
  function saveCostSheet() {
    if (!costModal) return;
    const total = costForm.reduce((s, l) => s + l.actual_amount, 0);
    upsertClientMonthlyCost({
      client_id: costModal.clientId,
      month: costModal.month,
      line_items: costForm,
      total_cost: total,
      notes: costNotes,
    });
    addAuditEntry({ user_id: 'founder', action: 'UPSERT_CLIENT_COST', entity: 'client_monthly_cost', entity_id: costModal.clientId });
    toast('Cost sheet saved', 'success');
    setCostModal(null);
  }

  function savePayment() {
    if (!paymentModal || !paymentForm.amount) { toast('Enter an amount', 'error'); return; }
    addPaymentRecord({
      client_id: paymentModal,
      date: paymentForm.date,
      amount: Number(paymentForm.amount),
      mode: paymentForm.mode,
      for_month: paymentForm.for_month,
      notes: paymentForm.notes,
    });
    addAuditEntry({ user_id: 'founder', action: 'RECORD_PAYMENT', entity: 'payment_record', entity_id: paymentModal });
    toast('Payment recorded', 'success');
    setPaymentModal(null);
    setPaymentForm({ date: new Date().toISOString().split('T')[0], amount: '', mode: 'Bank Transfer', for_month: currentMonth(), notes: '' });
  }

  function runScan() {
    setScanLoading(true);
    setScanModal(true);
    // small delay so modal opens first
    setTimeout(() => {
      const results = scanExistingForClientPayments();
      setScanResults(results);
      setScanLoading(false);
    }, 300);
  }

  function acceptScanResult(result: ScanResult, forMonth: string, mode: PaymentMethod) {
    addPaymentRecord({
      client_id: result.client_id,
      date: result.date,
      amount: result.amount,
      mode,
      for_month: forMonth,
      notes: `Auto-detected from ${result.source} transaction`,
    });
    setAcceptedIds(prev => new Set([...prev, result.id]));
    toast(`Payment from ${result.client_name} recorded`, 'success');
  }

  function getClientInvoices(clientId: string): Invoice[] {
    return invoices.filter(i => i.client_id === clientId).sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime());
  }
  function getClientMonths(clientId: string): string[] {
    const all = monthlyCosts.filter(c => c.client_id === clientId).map(c => c.month);
    if (!all.includes(currentMonth())) all.unshift(currentMonth());
    return [...new Set(all)].sort().reverse().slice(0, 12);
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="p-4 lg:p-6 max-w-[1100px]">
      <PageHeader
        title="Client Payments"
        subtitle="Revenue, invoicing, cost tracking per client"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<Search className="w-3.5 h-3.5" />} onClick={runScan}>
              Scan Transactions
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAddVerticalModal(true)}>+ Vertical</Button>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAddClient}>Add Client</Button>
          </div>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <MetricCard label="Active Clients" value={String(metrics.totalClients)} />
        <MetricCard label="Monthly Retainers" value={formatCurrency(metrics.totalMRR, true)} sub="MRR" accent="teal" />
        <MetricCard label="Pending Collection" value={formatCurrency(metrics.pendingAmount, true)} accent="amber" />
        <MetricCard label="Total Costs (This Month)" value={formatCurrency(metrics.totalCostThisMonth, true)} accent="red" icon={<DollarSign className="w-4 h-4" />} />
        <MetricCard label="Net Margin" value={formatCurrency(metrics.netMargin, true)} accent={metrics.netMargin >= 0 ? 'green' : 'red'} icon={<TrendingUp className="w-4 h-4" />} />
        {metrics.overdueCount > 0 && <MetricCard label="Overdue" value={String(metrics.overdueCount)} sub="invoices" accent="red" />}
      </div>

      {/* Client list */}
      {clients.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[#888] text-sm mb-3">No clients yet.</p>
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAddClient}>Add First Client</Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {clients.map(client => {
            const clientInvoices = getClientInvoices(client.id);
            const unpaid = clientInvoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + i.total, 0);
            const isOverdue = clientInvoices.some(i => (i.status === 'Sent' || i.status === 'Partially Paid') && i.due_date < today);
            const expanded = expandedClient === client.id;
            const vertical = verticals.find(v => v.id === client.vertical);
            const thisMonthCost = monthlyCosts.find(c => c.client_id === client.id && c.month === currentMonth());
            const clientAttributions = attributions.filter(a => a.client_id === client.id && a.month === currentMonth());
            const totalAttrCost = clientAttributions.reduce((s, a) => s + a.amount, 0);

            return (
              <div key={client.id} className="border border-[#e8e8e8] bg-white">
                {/* Header row */}
                <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[#fafafa]"
                  onClick={() => setExpandedClient(expanded ? null : client.id)}>
                  <div className="flex items-center gap-3 min-w-0">
                    {expanded ? <ChevronDown className="w-4 h-4 text-[#888] flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#888] flex-shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[#070707]">{client.name}</span>
                        <Badge variant="blue">{vertical?.label || client.vertical}</Badge>
                        {isOverdue && <Badge variant="red">Overdue</Badge>}
                        <Badge variant={client.status === 'active' ? 'green' : 'gray'}>{client.status}</Badge>
                      </div>
                      <p className="text-xs text-[#888] mt-0.5">{client.billing_cycle} · {client.payment_method} · {client.contact}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-medium">{formatCurrency(client.retainer_amount)}</p>
                      <p className="text-xs text-[#888]">retainer/mo</p>
                    </div>
                    {(thisMonthCost || totalAttrCost > 0) && (
                      <div className="text-right hidden md:block">
                        <p className="text-sm font-medium text-[#DC2626]">{formatCurrency(thisMonthCost?.total_cost || totalAttrCost)}</p>
                        <p className="text-xs text-[#888]">cost this month</p>
                      </div>
                    )}
                    {unpaid > 0 && (
                      <div className="text-right">
                        <p className="text-sm font-medium text-[#F59E0B]">{formatCurrency(unpaid)}</p>
                        <p className="text-xs text-[#888]">pending</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button onClick={e => { e.stopPropagation(); openEditClient(client); }} className="text-[#888] hover:text-[#070707]"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={e => { e.stopPropagation(); setDeleteClientId(client.id); }} className="text-[#888] hover:text-[#DC2626]"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>

                {/* Expanded content */}
                {expanded && (
                  <div className="border-t border-[#f0f0f0]">
                    {/* Tab row */}
                    <div className="flex border-b border-[#f0f0f0]">
                      {(['payments', 'invoices', 'costs'] as const).map(tab => (
                        <button key={tab} onClick={() => setExpandedTab(tab)}
                          className={`px-5 py-2.5 text-xs font-medium transition-colors ${expandedTab === tab ? 'text-[#070707] border-b-2 border-[#16C4BA] -mb-px' : 'text-[#888] hover:text-[#555]'}`}>
                          {tab === 'payments' ? 'Payments' : tab === 'invoices' ? 'Invoices' : 'Monthly Costs'}
                        </button>
                      ))}
                    </div>

                    {/* Payments tab — simple "received X on Y" records */}
                    {expandedTab === 'payments' && (
                      <div className="px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-medium text-[#888] uppercase tracking-wide">Payment History</span>
                          <Button size="sm" variant="primary" icon={<Plus className="w-3 h-3" />} onClick={() => setPaymentModal(client.id)}>
                            Record Payment
                          </Button>
                        </div>
                        {(() => {
                          const payments = getPaymentsByClient(client.id);
                          const totalPaid = getTotalPaidByClient(client.id);
                          if (payments.length === 0) return (
                            <div className="py-6 text-center">
                              <p className="text-sm text-[#888] mb-2">No payments recorded yet.</p>
                              <p className="text-xs text-[#aaa]">Record when a payment is received — date, amount, mode, which month it covers.</p>
                            </div>
                          );
                          return (
                            <>
                              <div className="mb-3 flex items-center gap-4 text-sm">
                                <span className="text-[#888]">Total received:</span>
                                <span className="font-bold text-[#16A34A]">{formatCurrency(totalPaid)}</span>
                              </div>
                              <div className="space-y-0">
                                {payments.map(p => (
                                  <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-[#f5f5f5] last:border-0">
                                    <div className="flex items-center gap-3">
                                      <div className="w-7 h-7 bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
                                        <CheckCircle className="w-3.5 h-3.5 text-[#16A34A]" />
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium text-[#070707]">{formatCurrency(p.amount)}</p>
                                        <p className="text-xs text-[#888]">
                                          {formatDate(p.date)} · {p.mode} · for {formatMonth(p.for_month)}
                                        </p>
                                        {p.notes && <p className="text-xs text-[#aaa] italic">{p.notes}</p>}
                                      </div>
                                    </div>
                                    <button onClick={() => { deletePaymentRecord(p.id); toast('Payment record deleted', 'info'); }}
                                      className="text-[#ccc] hover:text-[#DC2626] ml-3"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Invoices tab */}
                    {expandedTab === 'invoices' && (
                      <div className="px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-medium text-[#888] uppercase tracking-wide">Invoices</span>
                          <Button size="sm" variant="secondary" icon={<Plus className="w-3 h-3" />} onClick={() => openAddInvoice(client.id)}>Add Invoice</Button>
                        </div>
                        {clientInvoices.length === 0 ? (
                          <p className="text-sm text-[#888] py-3">No invoices yet.</p>
                        ) : clientInvoices.map(inv => {
                          const overdueDays = (inv.status === 'Sent' || inv.status === 'Partially Paid') && inv.due_date < today
                            ? Math.floor((new Date(today).getTime() - new Date(inv.due_date).getTime()) / 86400000) : null;
                          return (
                            <div key={inv.id} className="flex items-center justify-between py-2.5 border-b border-[#f5f5f5] last:border-0">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{inv.invoice_no}</span>
                                  <InvoiceStatusBadge status={inv.status} />
                                  {overdueDays !== null && overdueDays > 0 && (
                                    <span className="text-xs text-[#DC2626] flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" />{overdueDays}d overdue
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[#888] mt-0.5">Raised {formatDate(inv.invoice_date)} · Due {formatDate(inv.due_date)}</p>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="text-sm font-medium tabular-nums">{formatCurrency(inv.total)}</p>
                                  <p className="text-xs text-[#888]">incl. GST</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => openEditInvoice(inv)} className="text-[#888] hover:text-[#070707]"><Edit2 className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => setDeleteInvoiceId(inv.id)} className="text-[#888] hover:text-[#DC2626]"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Costs tab */}
                    {expandedTab === 'costs' && (
                      <div className="px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-medium text-[#888] uppercase tracking-wide">Monthly Cost Sheets</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                          {getClientMonths(client.id).map(month => {
                            const sheet = monthlyCosts.find(c => c.client_id === client.id && c.month === month);
                            const retainer = client.retainer_amount;
                            const cost = sheet?.total_cost || 0;
                            const margin = retainer - cost;
                            return (
                              <button key={month} onClick={() => openCostSheet(client.id, month)}
                                className="text-left p-3 border border-[#e8e8e8] hover:border-[#16C4BA] transition-colors">
                                <p className="text-xs font-medium text-[#555] mb-1">{formatMonth(month)}</p>
                                {sheet ? (
                                  <>
                                    <p className="text-sm font-semibold text-[#DC2626]">{formatCurrency(cost, true)} <span className="text-[#888] font-normal">cost</span></p>
                                    <p className={`text-xs ${margin >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                                      {margin >= 0 ? '+' : ''}{formatCurrency(margin, true)} margin
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-xs text-[#aaa]">Not entered yet</p>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* -- Add Vertical Modal -- */}
      <Modal open={addVerticalModal} onClose={() => setAddVerticalModal(false)} title="Manage Verticals" width="sm"
        footer={<Button variant="ghost" onClick={() => setAddVerticalModal(false)}>Done</Button>}>
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={newVerticalLabel} onChange={e => setNewVerticalLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddVertical()}
              placeholder="New vertical (e.g. Healthcare)" className="flex-1 px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
            <Button variant="primary" size="sm" onClick={handleAddVertical}>Add</Button>
          </div>
          <div className="space-y-1">
            {verticals.map(v => (
              <div key={v.id} className="flex items-center justify-between py-1.5 border-b border-[#f5f5f5] last:border-0 text-sm">
                <span>{v.label}</span>
                {v.is_custom && (
                  <button onClick={() => { /* deleteVertical(v.id); */ toast('Delete disabled to protect existing clients', 'info'); }}
                    className="text-[#ccc] hover:text-[#DC2626] text-xs">remove</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* -- Add/Edit Client Modal -- */}
      <Modal open={clientModal} onClose={() => setClientModal(false)}
        title={editingClient ? 'Edit Client' : 'Add Client'} width="xl"
        footer={<>
          <Button variant="ghost" onClick={() => setClientModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={saveClient} loading={loading}>Save Client</Button>
        </>}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Client Name *" value={clientForm.name} onChange={e => setClientForm({ ...clientForm, name: e.target.value })} placeholder="e.g. Tissera" />
            <div>
              <Select label="Vertical" value={clientForm.vertical} onChange={e => setClientForm({ ...clientForm, vertical: e.target.value })} options={verticalOptions} />
              <button onClick={() => setAddVerticalModal(true)} className="text-xs text-[#16C4BA] mt-1 hover:underline">+ Add new vertical</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Retainer (₹/month)" type="number" value={clientForm.retainer_amount} onChange={e => setClientForm({ ...clientForm, retainer_amount: e.target.value })} placeholder="0" />
            <Select label="Billing Cycle" value={clientForm.billing_cycle} onChange={e => setClientForm({ ...clientForm, billing_cycle: e.target.value as BillingCycle })} options={BILLING_OPTIONS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Payment Method" value={clientForm.payment_method} onChange={e => setClientForm({ ...clientForm, payment_method: e.target.value as PaymentMethod })} options={PAYMENT_OPTIONS} />
            <Select label="Status" value={clientForm.status} onChange={e => setClientForm({ ...clientForm, status: e.target.value as Client['status'] })} options={STATUS_OPTIONS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Contact Person" value={clientForm.contact} onChange={e => setClientForm({ ...clientForm, contact: e.target.value })} placeholder="Name or phone" />
            <Input label="Start Date" type="date" value={clientForm.start_date} onChange={e => setClientForm({ ...clientForm, start_date: e.target.value })} />
          </div>
          <Input label="GSTIN (optional)" value={clientForm.gstin} onChange={e => setClientForm({ ...clientForm, gstin: e.target.value })} placeholder="22XXXXX..." />

          {/* Fixed cost items */}
          <div>
            <p className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-2">Monthly Cost Template</p>
            <p className="text-xs text-[#888] mb-3">Define the standard expenses for this client. These pre-fill each month's cost sheet.</p>
            {clientForm.fixed_cost_items.length > 0 && (
              <div className="mb-3 space-y-1">
                {clientForm.fixed_cost_items.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-[#f7f7f5] text-sm">
                    <span>{item.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums">{formatCurrency(item.estimated_amount)}</span>
                      {item.is_variable && <Badge variant="amber">variable</Badge>}
                      <span className="text-xs text-[#888]">{categories.find(c => c.id === item.category_id)?.name || '—'}</span>
                      <button onClick={() => removeCostItemFromForm(item.id)} className="text-[#ccc] hover:text-[#DC2626]"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="border border-dashed border-[#ddd] p-3">
              <p className="text-xs text-[#888] mb-2">Add cost line item</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input value={newCostItem.label} onChange={e => setNewCostItem({ ...newCostItem, label: e.target.value })} placeholder="Label (e.g. Shoot)" className="px-2 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                <input type="number" value={newCostItem.estimated_amount} onChange={e => setNewCostItem({ ...newCostItem, estimated_amount: e.target.value })} placeholder="Est. amount (₹)" className="px-2 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <select value={newCostItem.category_id} onChange={e => setNewCostItem({ ...newCostItem, category_id: e.target.value })} className="px-2 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
                  <option value="">Category (optional)</option>
                  {categoryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <label className="flex items-center gap-2 text-xs text-[#555]">
                  <input type="checkbox" checked={newCostItem.is_variable} onChange={e => setNewCostItem({ ...newCostItem, is_variable: e.target.checked })} />
                  Variable (amount changes each month)
                </label>
              </div>
              <Button size="sm" variant="secondary" icon={<Plus className="w-3 h-3" />} onClick={addCostItemToForm}>Add Line Item</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* -- Invoice Modal -- */}
      <Modal open={!!invoiceModal} onClose={() => setInvoiceModal(null)} title={editingInvoice ? 'Edit Invoice' : 'New Invoice'}
        footer={<>
          <Button variant="ghost" onClick={() => setInvoiceModal(null)}>Cancel</Button>
          <Button variant="primary" onClick={saveInvoice} loading={loading}>Save Invoice</Button>
        </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Invoice Date" type="date" value={invoiceForm.invoice_date} onChange={e => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })} />
            <Input label="Due Date" type="date" value={invoiceForm.due_date} onChange={e => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Amount (₹, ex-GST)" type="number" value={invoiceForm.amount} onChange={e => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} />
            <Input label="GST Rate (%)" type="number" value={invoiceForm.gst_rate} onChange={e => setInvoiceForm({ ...invoiceForm, gst_rate: e.target.value })} />
          </div>
          {invoiceForm.amount && (
            <div className="bg-[#f7f7f5] px-3 py-2 text-sm">
              GST: {formatCurrency(Number(invoiceForm.amount) * Number(invoiceForm.gst_rate) / 100)} ·
              Total: <strong>{formatCurrency(Number(invoiceForm.amount) * (1 + Number(invoiceForm.gst_rate) / 100))}</strong>
            </div>
          )}
          <Select label="Status" value={invoiceForm.status} onChange={e => setInvoiceForm({ ...invoiceForm, status: e.target.value as InvoiceStatus })} options={INVOICE_STATUS_OPTIONS} />
          <Textarea label="Notes" value={invoiceForm.notes} onChange={e => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} rows={2} />
        </div>
      </Modal>

      {/* -- Monthly Cost Sheet Modal -- */}
      <Modal open={!!costModal} onClose={() => setCostModal(null)}
        title={costModal ? `Cost Sheet — ${formatMonth(costModal.month)}` : 'Cost Sheet'} width="lg"
        footer={<>
          <Button variant="ghost" onClick={() => setCostModal(null)}>Cancel</Button>
          <Button variant="primary" onClick={saveCostSheet}>Save Cost Sheet</Button>
        </>}>
        {costModal && (() => {
          const client = clients.find(c => c.id === costModal.clientId);
          const totalCost = costForm.reduce((s, l) => s + l.actual_amount, 0);
          const margin = (client?.retainer_amount || 0) - totalCost;
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm py-2 bg-[#f7f7f5] px-3">
                <span>Retainer: <strong>{formatCurrency(client?.retainer_amount || 0)}</strong></span>
                <span>Cost: <strong className="text-[#DC2626]">{formatCurrency(totalCost)}</strong></span>
                <span>Margin: <strong className={margin >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}>{formatCurrency(margin)}</strong></span>
              </div>
              <div className="space-y-2">
                {costForm.map((line, idx) => (
                  <div key={line.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <input value={line.label} onChange={e => { const f = [...costForm]; f[idx] = { ...f[idx], label: e.target.value }; setCostForm(f); }}
                        className="w-full px-2 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                    </div>
                    <div className="col-span-3">
                      <input type="number" placeholder="Planned" value={line.planned_amount || ''} onChange={e => { const f = [...costForm]; f[idx] = { ...f[idx], planned_amount: Number(e.target.value) }; setCostForm(f); }}
                        className="w-full px-2 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                    </div>
                    <div className="col-span-3">
                      <input type="number" placeholder="Actual" value={line.actual_amount || ''} onChange={e => { const f = [...costForm]; f[idx] = { ...f[idx], actual_amount: Number(e.target.value) }; setCostForm(f); }}
                        className="w-full px-2 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA] bg-[#fffef7]" />
                    </div>
                    <div className="col-span-2 text-right">
                      <button onClick={() => setCostForm(costForm.filter((_, i) => i !== idx))} className="text-[#ccc] hover:text-[#DC2626]"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
                <div className="text-xs text-[#888] grid grid-cols-12 gap-2 px-0.5">
                  <span className="col-span-4">Label</span>
                  <span className="col-span-3">Planned (₹)</span>
                  <span className="col-span-3">Actual (₹)</span>
                </div>
              </div>
              <Button size="sm" variant="secondary" icon={<Plus className="w-3 h-3" />} onClick={() => setCostForm([...costForm, { id: crypto.randomUUID(), label: '', planned_amount: 0, actual_amount: 0, category_id: '', transaction_ids: [] }])}>
                Add Line
              </Button>
              <Textarea label="Notes" value={costNotes} onChange={e => setCostNotes(e.target.value)} rows={2} placeholder="Any notes about this month's costs..." />
            </div>
          );
        })()}
      </Modal>

      {/* -- Payment Record Modal -- */}
      <Modal open={!!paymentModal} onClose={() => setPaymentModal(null)} title="Record Payment Received" width="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setPaymentModal(null)}>Cancel</Button>
          <Button variant="primary" icon={<CheckCircle className="w-4 h-4" />} onClick={savePayment}>Record Payment</Button>
        </>}>
        <div className="space-y-4">
          {paymentModal && (() => {
            const client = clients.find(c => c.id === paymentModal);
            return (
              <div className="bg-[#f7f7f5] px-3 py-2 text-sm">
                <span className="text-[#888]">Client: </span>
                <span className="font-semibold">{client?.name}</span>
                <span className="text-[#888] ml-3">Retainer: </span>
                <span className="font-semibold">{formatCurrency(client?.retainer_amount || 0)}</span>
              </div>
            );
          })()}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Date Received" type="date" value={paymentForm.date} onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })} />
            <Input label="Amount (₹)" type="number" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} placeholder="0" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Payment Mode" value={paymentForm.mode}
              onChange={e => setPaymentForm({ ...paymentForm, mode: e.target.value as PaymentMethod })}
              options={[{ value: 'UPI', label: 'UPI' }, { value: 'Bank Transfer', label: 'Bank Transfer' }, { value: 'Cash', label: 'Cash' }, { value: 'Cheque', label: 'Cheque' }]} />
            <div>
              <label className="text-xs font-medium text-[#555] uppercase tracking-wide block mb-1">For Month</label>
              <input type="month" value={paymentForm.for_month} onChange={e => setPaymentForm({ ...paymentForm, for_month: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
            </div>
          </div>
          <Input label="Notes (optional)" value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
            placeholder="e.g. Final payment for May, partial payment..." />
        </div>
      </Modal>

      <ConfirmModal open={!!deleteClientId} onClose={() => setDeleteClientId(null)}
        onConfirm={() => { if (deleteClientId) { deleteClient(deleteClientId); toast('Client deleted', 'info'); setDeleteClientId(null); } }}
        title="Delete Client" message="Delete this client and all their invoices?" />
      <ConfirmModal open={!!deleteInvoiceId} onClose={() => setDeleteInvoiceId(null)}
        onConfirm={() => { if (deleteInvoiceId) { deleteInvoice(deleteInvoiceId); toast('Invoice deleted', 'info'); setDeleteInvoiceId(null); } }}
        title="Delete Invoice" message="Delete this invoice?" />

      {/* Scan existing transactions modal */}
      <Modal open={scanModal} onClose={() => setScanModal(false)} title="Scan Transactions for Client Payments" width="xl"
        footer={<Button variant="ghost" onClick={() => setScanModal(false)}>Done</Button>}>
        {scanLoading ? (
          <div className="flex items-center justify-center py-12 gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-[#16C4BA]" />
            <p className="text-sm text-[#888]">Scanning all transactions for client payments...</p>
          </div>
        ) : scanResults.length === 0 ? (
          <div className="text-center py-10">
            <CheckCircle className="w-10 h-10 text-[#16A34A] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#555]">No unrecorded client payments found</p>
            <p className="text-xs text-[#aaa] mt-1">All transactions that match client names have already been recorded, or no matches were found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-[#f0fdfa] border border-[#99f6e4] px-3 py-2 text-xs text-[#0d9488]">
              Found <strong>{scanResults.filter(r => !r.alreadyRecorded && !acceptedIds.has(r.id)).length}</strong> unrecorded transaction{scanResults.length !== 1 ? 's' : ''} that look like client payments.
              Accept the ones that are correct — they'll be added to the Payments tab for each client.
            </div>
            {scanResults.filter(r => !r.alreadyRecorded).map(result => {
              const isAccepted = acceptedIds.has(result.id);
              return (
                <ScanResultRow
                  key={result.id}
                  result={result}
                  isAccepted={isAccepted}
                  onAccept={acceptScanResult}
                />
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
