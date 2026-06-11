import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Edit2, Wallet, Filter, Info, Camera } from 'lucide-react';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Card, MetricCard } from '@/components/ui/Card';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastProvider';
import { NotebookImport } from '@/components/ui/NotebookImport';
import { PaymentSuggestionDialog } from '@/components/ui/PaymentSuggestionDialog';
import { detectClientPayment, type PaymentSuggestion } from '@/lib/payment-detector';
import {
  getCashTransactions, addCashTransaction, updateCashTransaction,
  deleteCashTransaction, getCategories, computeCashBalance,
  getAppSettings, addAuditEntry, getClients,
} from '@/lib/storage';
import { autoLinkToCosting } from '@/lib/auto-cost-link';
import { formatCurrency, formatDate, currentMonth } from '@/utils/format';
import { addPaymentRecord } from '@/lib/payments';
import type { CashTransaction, CashType } from '@/types';

const VERTICALS = [
  { value: '', label: 'No vertical' },
  { value: 'restaurants', label: 'Restaurants' },
  { value: 'menswear', label: 'Menswear' },
  { value: 'weddings', label: 'Weddings' },
  { value: 'other', label: 'Other' },
];

// Extend CashTransaction locally for GST fields (stored in tags as metadata)
interface CashTxnWithGST extends CashTransaction {
  gst_included?: boolean;
  gst_rate?: number;
  gst_amount?: number;
  base_amount?: number;
}

function parseGSTFromTags(txn: CashTransaction): { gst_included: boolean; gst_rate: number; gst_amount: number; base_amount: number } {
  const gstTag = txn.tags.find(t => t.startsWith('gst:'));
  if (!gstTag) return { gst_included: false, gst_rate: 18, gst_amount: 0, base_amount: txn.amount };
  const [, rateStr] = gstTag.split(':');
  const rate = parseFloat(rateStr) || 18;
  const base = txn.amount / (1 + rate / 100);
  const gst = txn.amount - base;
  return { gst_included: true, gst_rate: rate, gst_amount: gst, base_amount: base };
}

export function CashTransactionsPage() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [notebookModal, setNotebookModal] = useState(false);
  const [paymentSuggestion, setPaymentSuggestion] = useState<PaymentSuggestion | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [filterType, setFilterType] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const DEFAULT_FORM = {
    date: new Date().toISOString().split('T')[0],
    type: 'Cash Out' as CashType,
    amount: '',
    category_id: '',
    party: '',
    description: '',
    reason: '',
    vertical: '',
    tags: '',
    client_id: '',
    // GST fields
    gst_applies: false,
    gst_rate: '18',
    gst_treatment: 'included' as 'included' | 'excluded',
  };
  const [form, setForm] = useState(DEFAULT_FORM);

  const categories = getCategories();
  const settings = getAppSettings();
  const cashBalance = computeCashBalance();
  const clients = getClients();
  const allTxns = getCashTransactions();

  const catOptions = categories.map(c => ({ value: c.id, label: c.name }));
  const clientOptions = [{ value: '', label: 'Not client-specific' }, ...clients.filter(c => c.status === 'active').map(c => ({ value: c.id, label: c.name }))];

  const filtered = useMemo(() => {
    return allTxns.filter(t => {
      if (filterMonth && !t.date.startsWith(filterMonth)) return false;
      if (filterType && t.type !== filterType) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allTxns, filterMonth, filterType]);

  const monthMetrics = useMemo(() => {
    const m = allTxns.filter(t => t.date.startsWith(filterMonth));
    const cashIn = m.filter(t => t.type === 'Cash In').reduce((s, t) => s + t.amount, 0);
    const cashOut = m.filter(t => t.type === 'Cash Out').reduce((s, t) => s + t.amount, 0);
    // GST collected on cash-in this month
    const gstCollected = m.filter(t => t.type === 'Cash In').reduce((s, t) => {
      const { gst_amount } = parseGSTFromTags(t);
      return s + gst_amount;
    }, 0);
    return { cashIn, cashOut, net: cashIn - cashOut, count: m.length, gstCollected };
  }, [allTxns, filterMonth]);

  // Compute display amounts
  function getDisplayAmount(form: typeof DEFAULT_FORM): { totalAmount: number; baseAmount: number; gstAmount: number } {
    const raw = Number(form.amount) || 0;
    if (!form.gst_applies) return { totalAmount: raw, baseAmount: raw, gstAmount: 0 };
    const rate = Number(form.gst_rate) || 18;
    if (form.gst_treatment === 'included') {
      const base = raw / (1 + rate / 100);
      return { totalAmount: raw, baseAmount: base, gstAmount: raw - base };
    } else {
      return { totalAmount: raw + raw * rate / 100, baseAmount: raw, gstAmount: raw * rate / 100 };
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) errs.amount = 'Enter a valid amount';
    if (!form.category_id) errs.category_id = 'Select a category';
    if (!form.party.trim()) errs.party = 'Enter who this was with';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function openAdd() {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(txn: CashTransaction) {
    const gstInfo = parseGSTFromTags(txn);
    setForm({
      date: txn.date, type: txn.type,
      amount: txn.amount.toString(),
      category_id: txn.category_id, party: txn.party,
      description: txn.description, reason: txn.reason || '',
      vertical: txn.vertical || '', tags: txn.tags.filter(t => !t.startsWith('gst:')).join(', '),
      client_id: txn.client_id || '',
      gst_applies: gstInfo.gst_included,
      gst_rate: gstInfo.gst_rate.toString(),
      gst_treatment: 'included',
    });
    setEditingId(txn.id);
    setErrors({});
    setModalOpen(true);
  }

  async function handleSave() {
    if (!validate()) return;
    setLoading(true);
    const { totalAmount, gstAmount } = getDisplayAmount(form);
    const gstTag = form.gst_applies ? [`gst:${form.gst_rate}`] : [];
    const gstNotedTag = form.gst_applies ? ['gst-noted'] : [];
    const otherTags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
    const payload = {
      date: form.date, type: form.type,
      amount: form.gst_applies && form.gst_treatment === 'excluded' ? totalAmount : Number(form.amount),
      category_id: form.category_id, party: form.party.trim(),
      description: form.description.trim(), reason: form.reason.trim(),
      vertical: form.vertical || undefined,
      tags: [...otherTags, ...gstTag, ...gstNotedTag],
      client_id: form.client_id || undefined,
      created_by: 'founder',
    };
    if (editingId) {
      updateCashTransaction(editingId, payload);
      toast('Transaction updated', 'success');
    } else {
      const t = addCashTransaction(payload);
      autoLinkToCosting(t, 'cash');
      addAuditEntry({ user_id: 'founder', action: 'ADD_CASH_TXN', entity: 'cash_transaction', entity_id: t.id });

      // Auto-detect if this looks like a client payment
      if (form.type === 'Cash In') {
        const suggestion = detectClientPayment(
          form.party,
          form.description,
          '',
          Number(form.amount),
          form.date,
        );
        if (suggestion) {
          setPaymentSuggestion(suggestion);
        }
      }
      if (form.gst_applies) {
        toast(`Added ₹${Number(form.amount).toLocaleString()} (incl. ₹${gstAmount.toFixed(0)} GST)`, 'success');
      } else {
        toast('Transaction added', 'success');
      }
    }
    setLoading(false);
    setModalOpen(false);
  }

  function applyQuickEntry(qe: typeof settings.quick_entries[0]) {
    setForm({ ...DEFAULT_FORM, type: qe.type, amount: qe.amount.toString(), category_id: qe.category_id, description: qe.description });
    setEditingId(null); setErrors({}); setModalOpen(true);
  }

  const { totalAmount, baseAmount, gstAmount } = getDisplayAmount(form);

  return (
    <div className="p-4 lg:p-6 max-w-[1200px]">
      <PageHeader
        title="Cash Transactions"
        subtitle={`Cash holder: ${settings.cash_holder_custom || settings.cash_holder}`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<Camera className="w-4 h-4" />} onClick={() => setNotebookModal(true)}>
              Scan Notebook
            </Button>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAdd}>Add</Button>
          </div>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <MetricCard label="Cash in Hand" value={formatCurrency(cashBalance, true)} accent="teal" icon={<Wallet className="w-4 h-4" />} />
        <MetricCard label="Cash In" value={formatCurrency(monthMetrics.cashIn, true)} sub={filterMonth} accent="green" />
        <MetricCard label="Cash Out" value={formatCurrency(monthMetrics.cashOut, true)} sub={filterMonth} accent="red" />
        <MetricCard label="Transactions" value={String(monthMetrics.count)} sub={filterMonth} />
        {monthMetrics.gstCollected > 0 && (
          <MetricCard label="GST Collected" value={formatCurrency(monthMetrics.gstCollected, true)} sub="In cash receipts" accent="amber" />
        )}
      </div>

      {/* Quick entries */}
      {settings.quick_entries.length > 0 && (
        <Card className="mb-5">
          <p className="text-xs font-medium text-[#888] uppercase tracking-wide mb-3">Quick Entry</p>
          <div className="flex flex-wrap gap-2">
            {settings.quick_entries.map(qe => (
              <button key={qe.id} onClick={() => applyQuickEntry(qe)}
                className="px-3 py-1.5 text-xs border border-[#e0e0e0] text-[#555] hover:border-[#16C4BA] hover:text-[#16C4BA] transition-colors">
                {qe.label} · {formatCurrency(qe.amount)}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Filter className="w-4 h-4 text-[#888]" />
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          className="px-3 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
          <option value="">All types</option>
          <option value="Cash In">Cash In</option>
          <option value="Cash Out">Cash Out</option>
        </select>
        <span className="text-xs text-[#888]">{filtered.length} transactions</span>
      </div>

      {/* Table */}
      <div className="border border-[#e8e8e8] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#fafafa] border-b border-[#e8e8e8] text-xs text-[#555] uppercase tracking-wide">
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Description</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Reason</th>
              <th className="text-right px-4 py-3">Amount</th>
              <th className="text-right px-4 py-3">GST</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-[#888]">No cash transactions yet.</td></tr>
            ) : filtered.map(t => {
              const gstInfo = parseGSTFromTags(t);
              return (
                <tr key={t.id} className="border-b border-[#f5f5f5] hover:bg-[#fafafa]">
                  <td className="px-4 py-2.5 text-xs text-[#666]">{formatDate(t.date)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-1.5 py-0.5 font-medium ${t.type === 'Cash In' ? 'bg-[#dcfce7] text-[#16A34A]' : 'bg-[#fee2e2] text-[#DC2626]'}`}>{t.type}</span>
                  </td>
                  <td className="px-4 py-2.5" style={{ maxWidth: '200px' }}>
                    <p className="text-sm break-words leading-snug">{t.description || t.party}</p>
                    <p className="text-xs text-[#888]">{t.party !== (t.description || t.party) ? t.party : ''}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[#555]">{categories.find(c => c.id === t.category_id)?.name || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-[#888]" style={{ maxWidth: '160px' }}>
                    <span className="break-words leading-snug">{t.reason || '—'}</span>
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${t.type === 'Cash In' ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                    {t.type === 'Cash In' ? '+' : '-'}{formatCurrency(t.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-[#888] tabular-nums">
                    {gstInfo.gst_included ? (
                      <span className="text-[#F59E0B]">+{formatCurrency(gstInfo.gst_amount, true)}</span>
                    ) : '—'}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(t)} className="text-[#888] hover:text-[#070707]"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteId(t.id)} className="text-[#888] hover:text-[#DC2626]"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Transaction' : 'New Cash Transaction'} width="md"
        footer={<>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} loading={loading}>{editingId ? 'Save' : 'Add'}</Button>
        </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <Select label="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as CashType })}
              options={[{ value: 'Cash In', label: 'Cash In' }, { value: 'Cash Out', label: 'Cash Out' }]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label={form.gst_applies ? `Amount (₹) — ${form.gst_treatment === 'included' ? 'GST incl.' : 'before GST'}` : 'Amount (₹)'}
              type="number" placeholder="0" value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })} error={errors.amount} />
            <Select label="Category" value={form.category_id}
              onChange={e => setForm({ ...form, category_id: e.target.value })}
              options={catOptions} placeholder="Select category" error={errors.category_id} />
          </div>

          {/* GST section */}
          <div className="border border-[#e8e8e8] p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-sm text-[#555] cursor-pointer">
                <input type="checkbox" checked={form.gst_applies} onChange={e => setForm({ ...form, gst_applies: e.target.checked })} className="w-4 h-4" />
                <span className="font-medium">GST applies to this transaction</span>
              </label>
              <div className="flex items-center gap-1 text-[#888]" title="For cash receipts from clients who pay GST, record the GST here for proper tax accounting">
                <Info className="w-3.5 h-3.5" />
                <span className="text-xs">Why?</span>
              </div>
            </div>

            {form.gst_applies && (
              <div className="space-y-3 mt-3 pt-3 border-t border-[#f0f0f0]">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[#555] uppercase tracking-wide block mb-1">GST Rate</label>
                    <select value={form.gst_rate} onChange={e => setForm({ ...form, gst_rate: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#555] uppercase tracking-wide block mb-1">Amount entered is</label>
                    <select value={form.gst_treatment} onChange={e => setForm({ ...form, gst_treatment: e.target.value as 'included' | 'excluded' })}
                      className="w-full px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
                      <option value="included">GST inclusive (total)</option>
                      <option value="excluded">GST exclusive (base only)</option>
                    </select>
                  </div>
                </div>
                {form.amount && (
                  <div className="bg-[#f7f7f5] px-3 py-2 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-[#888]">Base amount</span><span className="tabular-nums font-medium">{formatCurrency(baseAmount)}</span></div>
                    <div className="flex justify-between"><span className="text-[#888]">GST @ {form.gst_rate}%</span><span className="tabular-nums text-[#F59E0B] font-medium">{formatCurrency(gstAmount)}</span></div>
                    <div className="flex justify-between border-t border-[#e0e0e0] pt-1"><span className="font-semibold">Total</span><span className="tabular-nums font-bold">{formatCurrency(totalAmount)}</span></div>
                  </div>
                )}
              </div>
            )}
          </div>

          <Input label="Party (who)" placeholder="Client name, vendor, team member..." value={form.party}
            onChange={e => setForm({ ...form, party: e.target.value })} error={errors.party} />
          <Input label="Description" placeholder="What was this for?" value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })} />
          <Input label="Reason (optional detail)" placeholder="e.g. Advance for June shoot, Tissera" value={form.reason}
            onChange={e => setForm({ ...form, reason: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Client (optional)" value={form.client_id}
              onChange={e => setForm({ ...form, client_id: e.target.value })} options={clientOptions} />
            <Input label="Tags" placeholder="comma separated" value={form.tags}
              onChange={e => setForm({ ...form, tags: e.target.value })} />
          </div>
        </div>
      </Modal>

      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) { deleteCashTransaction(deleteId); toast('Deleted', 'info'); setDeleteId(null); } }}
        title="Delete Transaction" message="Delete this cash transaction?" />

      {/* Notebook import modal */}
      <Modal open={notebookModal} onClose={() => setNotebookModal(false)}
        title="Scan Notebook" width="lg">
        <NotebookImport onDone={() => { setNotebookModal(false); toast('Transactions imported from notebook', 'success'); }} />
      </Modal>

      {/* Client payment suggestion popup */}
      {paymentSuggestion && (
        <PaymentSuggestionDialog
          suggestion={paymentSuggestion}
          direction="in"
          totalAmount={paymentSuggestion.suggested_amount}
          onAccept={(slices) => {
            // For each slice, record a payment in Client Payments
            slices.forEach(slice => {
              addPaymentRecord({
                client_id: slice.client_id,
                date: new Date().toISOString().split('T')[0],
                amount: slice.amount,
                mode: 'Cash',
                for_month: paymentSuggestion.suggested_month,
                notes: slices.length > 1 ? `Split: ${slices.length} clients, total ${formatCurrency(paymentSuggestion.suggested_amount)}` : 'Auto-detected from cash entry',
              });
            });
            toast(
              slices.length > 1
                ? `Payment split across ${slices.length} clients recorded`
                : `Payment from ${paymentSuggestion.client_name} recorded in Client Payments`,
              'success'
            );
            setPaymentSuggestion(null);
          }}
          onDismiss={() => setPaymentSuggestion(null)}
        />
      )}
    </div>
  );
}
