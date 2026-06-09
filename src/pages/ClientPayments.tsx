import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Card, MetricCard } from '@/components/ui/Card';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Badge, InvoiceStatusBadge, VerticalBadge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import {
  getClients, addClient, updateClient, deleteClient,
  getInvoices, addInvoice, updateInvoice, deleteInvoice,
  addAuditEntry
} from '@/lib/storage';
import { formatCurrency, formatDate, generateInvoiceNo } from '@/utils/format';
import type { Client, Invoice, Vertical, BillingCycle, PaymentMethod, InvoiceStatus } from '@/types';

const VERTICAL_OPTIONS = [
  { value: 'restaurants', label: 'Restaurants' },
  { value: 'menswear', label: 'Menswear' },
  { value: 'weddings', label: 'Weddings' },
  { value: 'other', label: 'Other' },
];

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

export function ClientPaymentsPage() {
  const toast = useToast();
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [clientModal, setClientModal] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState<string | null>(null); // client id
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Client form
  const [clientForm, setClientForm] = useState({
    name: '', vertical: 'restaurants' as Vertical, retainer_amount: '',
    billing_cycle: 'monthly' as BillingCycle, payment_method: 'UPI' as PaymentMethod,
    gstin: '', contact: '', start_date: new Date().toISOString().split('T')[0], status: 'active' as Client['status'],
  });

  // Invoice form
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    amount: '', gst_rate: '18', notes: '', status: 'Sent' as InvoiceStatus,
  });

  const clients = getClients();
  const invoices = getInvoices();

  const metrics = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const activeClients = clients.filter(c => c.status === 'active');
    const totalMRR = activeClients.reduce((s, c) => c.billing_cycle === 'monthly' ? s + c.retainer_amount : s, 0);
    const pending = invoices.filter(i => i.status === 'Sent' || i.status === 'Partially Paid');
    const overdue = invoices.filter(i => i.status === 'Overdue' || ((i.status === 'Sent' || i.status === 'Partially Paid') && i.due_date < today));
    return {
      totalClients: activeClients.length,
      totalMRR,
      pendingAmount: pending.reduce((s, i) => s + i.total, 0),
      overdueCount: overdue.length,
    };
  }, [clients, invoices]);

  function openAddClient() {
    setClientForm({ name: '', vertical: 'restaurants', retainer_amount: '', billing_cycle: 'monthly', payment_method: 'UPI', gstin: '', contact: '', start_date: new Date().toISOString().split('T')[0], status: 'active' });
    setEditingClient(null);
    setClientModal(true);
  }

  function openEditClient(c: Client) {
    setClientForm({ name: c.name, vertical: c.vertical, retainer_amount: c.retainer_amount.toString(), billing_cycle: c.billing_cycle, payment_method: c.payment_method, gstin: c.gstin || '', contact: c.contact, start_date: c.start_date, status: c.status });
    setEditingClient(c);
    setClientModal(true);
  }

  async function saveClient() {
    if (!clientForm.name.trim()) return;
    setLoading(true);
    const payload = { ...clientForm, retainer_amount: Number(clientForm.retainer_amount) || 0 };
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
      invoice_date: invoiceForm.invoice_date,
      due_date: invoiceForm.due_date || invoiceForm.invoice_date,
      amount, gst_amount, total: amount + gst_amount,
      status: invoiceForm.status, notes: invoiceForm.notes,
    };
    if (editingInvoice) {
      updateInvoice(editingInvoice.id, payload);
      addAuditEntry({ user_id: 'founder', action: 'UPDATE_INVOICE', entity: 'invoice', entity_id: editingInvoice.id });
    } else {
      const inv = addInvoice(payload);
      addAuditEntry({ user_id: 'founder', action: 'ADD_INVOICE', entity: 'invoice', entity_id: inv.id });
    }
    toast(editingInvoice ? 'Invoice updated' : 'Invoice created', 'success');
    setLoading(false);
    setInvoiceModal(null);
  }

  function getClientInvoices(clientId: string) {
    return invoices.filter(i => i.client_id === clientId).sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime());
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="p-6 max-w-[1100px]">
      <PageHeader
        title="Client Payments"
        subtitle="Track receivables, invoices, and payment status"
        actions={
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAddClient}>
            Add Client
          </Button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Active Clients" value={String(metrics.totalClients)} />
        <MetricCard label="Monthly Retainers" value={formatCurrency(metrics.totalMRR, true)} sub="MRR" accent="teal" />
        <MetricCard label="Pending Collection" value={formatCurrency(metrics.pendingAmount, true)} accent="amber" />
        {metrics.overdueCount > 0 && (
          <MetricCard label="Overdue" value={String(metrics.overdueCount)} sub="invoices" accent="red" />
        )}
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

            return (
              <div key={client.id} className="border border-[#e8e8e8] bg-white">
                {/* Client header row */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[#fafafa]"
                  onClick={() => setExpandedClient(expanded ? null : client.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {expanded ? <ChevronDown className="w-4 h-4 text-[#888] flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#888] flex-shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#070707]">{client.name}</span>
                        <VerticalBadge vertical={client.vertical} />
                        {isOverdue && <Badge variant="red">Overdue</Badge>}
                        <Badge variant={client.status === 'active' ? 'green' : 'gray'}>{client.status}</Badge>
                      </div>
                      <p className="text-xs text-[#888] mt-0.5">
                        {client.billing_cycle} · {client.payment_method} · {client.contact}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 ml-4 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-medium">{formatCurrency(client.retainer_amount)}</p>
                      <p className="text-xs text-[#888]">retainer</p>
                    </div>
                    {unpaid > 0 && (
                      <div className="text-right">
                        <p className="text-sm font-medium text-[#F59E0B]">{formatCurrency(unpaid)}</p>
                        <p className="text-xs text-[#888]">pending</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button onClick={e => { e.stopPropagation(); openEditClient(client); }} className="text-[#888] hover:text-[#070707]">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setDeleteClientId(client.id); }} className="text-[#888] hover:text-[#DC2626]">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded: invoices */}
                {expanded && (
                  <div className="border-t border-[#f0f0f0] px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-[#888] uppercase tracking-wide">Invoices</span>
                      <Button size="sm" variant="secondary" icon={<Plus className="w-3 h-3" />} onClick={() => openAddInvoice(client.id)}>
                        Add Invoice
                      </Button>
                    </div>
                    {clientInvoices.length === 0 ? (
                      <p className="text-sm text-[#888] py-3">No invoices yet.</p>
                    ) : (
                      <div className="space-y-0">
                        {clientInvoices.map(inv => {
                          const overdueDays = (inv.status === 'Sent' || inv.status === 'Partially Paid') && inv.due_date < today
                            ? Math.floor((new Date(today).getTime() - new Date(inv.due_date).getTime()) / 86400000) : null;
                          return (
                            <div key={inv.id} className="flex items-center justify-between py-2.5 border-b border-[#f5f5f5] last:border-0">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-[#070707]">{inv.invoice_no}</span>
                                  <InvoiceStatusBadge status={inv.status} />
                                  {overdueDays !== null && overdueDays > 0 && (
                                    <span className="text-xs text-[#DC2626] flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" />{overdueDays}d overdue
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[#888] mt-0.5">
                                  Raised {formatDate(inv.invoice_date)} · Due {formatDate(inv.due_date)}
                                </p>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="text-sm font-medium tabular-nums">{formatCurrency(inv.total)}</p>
                                  <p className="text-xs text-[#888]">incl. GST</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => openEditInvoice(inv)} className="text-[#888] hover:text-[#070707]">
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setDeleteInvoiceId(inv.id)} className="text-[#888] hover:text-[#DC2626]">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Client Modal */}
      <Modal
        open={clientModal}
        onClose={() => setClientModal(false)}
        title={editingClient ? 'Edit Client' : 'Add Client'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setClientModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveClient} loading={loading}>Save Client</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Client Name" value={clientForm.name} onChange={e => setClientForm({ ...clientForm, name: e.target.value })} placeholder="Client name" />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Vertical" value={clientForm.vertical} onChange={e => setClientForm({ ...clientForm, vertical: e.target.value as Vertical })} options={VERTICAL_OPTIONS} />
            <Select label="Status" value={clientForm.status} onChange={e => setClientForm({ ...clientForm, status: e.target.value as Client['status'] })} options={STATUS_OPTIONS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Retainer (₹)" type="number" value={clientForm.retainer_amount} onChange={e => setClientForm({ ...clientForm, retainer_amount: e.target.value })} placeholder="0" />
            <Select label="Billing Cycle" value={clientForm.billing_cycle} onChange={e => setClientForm({ ...clientForm, billing_cycle: e.target.value as BillingCycle })} options={BILLING_OPTIONS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Payment Method" value={clientForm.payment_method} onChange={e => setClientForm({ ...clientForm, payment_method: e.target.value as PaymentMethod })} options={PAYMENT_OPTIONS} />
            <Input label="Start Date" type="date" value={clientForm.start_date} onChange={e => setClientForm({ ...clientForm, start_date: e.target.value })} />
          </div>
          <Input label="Contact Person" value={clientForm.contact} onChange={e => setClientForm({ ...clientForm, contact: e.target.value })} placeholder="Name or phone" />
          <Input label="GSTIN (optional)" value={clientForm.gstin} onChange={e => setClientForm({ ...clientForm, gstin: e.target.value })} placeholder="22XXXXX..." />
        </div>
      </Modal>

      {/* Invoice Modal */}
      <Modal
        open={!!invoiceModal}
        onClose={() => setInvoiceModal(null)}
        title={editingInvoice ? 'Edit Invoice' : 'New Invoice'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setInvoiceModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveInvoice} loading={loading}>Save Invoice</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Invoice Date" type="date" value={invoiceForm.invoice_date} onChange={e => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })} />
            <Input label="Due Date" type="date" value={invoiceForm.due_date} onChange={e => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Amount (₹, ex-GST)" type="number" value={invoiceForm.amount} onChange={e => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} placeholder="0" />
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

      <ConfirmModal open={!!deleteClientId} onClose={() => setDeleteClientId(null)}
        onConfirm={() => { if (deleteClientId) { deleteClient(deleteClientId); toast('Client deleted', 'info'); setDeleteClientId(null); } }}
        title="Delete Client" message="Delete this client and all their invoices?" />
      <ConfirmModal open={!!deleteInvoiceId} onClose={() => setDeleteInvoiceId(null)}
        onConfirm={() => { if (deleteInvoiceId) { deleteInvoice(deleteInvoiceId); toast('Invoice deleted', 'info'); setDeleteInvoiceId(null); } }}
        title="Delete Invoice" message="Delete this invoice?" />
    </div>
  );
}
