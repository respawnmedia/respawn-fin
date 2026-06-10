import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Edit2, Wallet, Filter } from 'lucide-react';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Card, MetricCard } from '@/components/ui/Card';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Table, Column } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import {
  getCashTransactions, addCashTransaction, updateCashTransaction,
  deleteCashTransaction, getCategories, computeCashBalance,
  getAppSettings, addAuditEntry
} from '@/lib/storage';
import { formatCurrency, formatDate, currentMonth } from '@/utils/format';
import type { CashTransaction, CashType } from '@/types';

const VERTICALS: { value: string; label: string }[] = [
  { value: '', label: 'No vertical' },
  { value: 'restaurants', label: 'Restaurants' },
  { value: 'menswear', label: 'Menswear' },
  { value: 'weddings', label: 'Weddings' },
  { value: 'other', label: 'Other' },
];

interface FormData {
  date: string;
  type: CashType;
  amount: string;
  category_id: string;
  party: string;
  description: string;
  vertical: string;
  tags: string;
}

const DEFAULT_FORM: FormData = {
  date: new Date().toISOString().split('T')[0],
  type: 'Cash Out',
  amount: '',
  category_id: '',
  party: '',
  description: '',
  vertical: '',
  tags: '',
};

export function CashTransactionsPage() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [filterType, setFilterType] = useState('');
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [loading, setLoading] = useState(false);

  const categories = getCategories();
  const settings = getAppSettings();
  const cashBalance = computeCashBalance();

  const catOptions = categories
    .filter(c => c.type === 'expense' || c.type === 'both')
    .map(c => ({ value: c.id, label: c.name }));

  const allTxns = getCashTransactions();

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
    return { cashIn, cashOut, net: cashIn - cashOut, count: m.length };
  }, [allTxns, filterMonth]);

  function validate(): boolean {
    const errs: Partial<FormData> = {};
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
    setForm({
      date: txn.date,
      type: txn.type,
      amount: txn.amount.toString(),
      category_id: txn.category_id,
      party: txn.party,
      description: txn.description,
      vertical: txn.vertical || '',
      tags: txn.tags.join(', '),
    });
    setEditingId(txn.id);
    setErrors({});
    setModalOpen(true);
  }

  async function handleSave() {
    if (!validate()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 100));

    const payload = {
      date: form.date,
      type: form.type,
      amount: Number(form.amount),
      category_id: form.category_id,
      party: form.party.trim(),
      description: form.description.trim(),
      vertical: form.vertical || undefined,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      created_by: 'founder',
    };

    if (editingId) {
      updateCashTransaction(editingId, payload);
      addAuditEntry({ user_id: 'founder', action: 'UPDATE_CASH_TXN', entity: 'cash_transaction', entity_id: editingId });
      toast('Transaction updated', 'success');
    } else {
      const newTxn = addCashTransaction(payload);
      addAuditEntry({ user_id: 'founder', action: 'ADD_CASH_TXN', entity: 'cash_transaction', entity_id: newTxn.id });
      toast('Transaction added', 'success');
    }
    setLoading(false);
    setModalOpen(false);
  }

  function handleDelete() {
    if (!deleteId) return;
    deleteCashTransaction(deleteId);
    addAuditEntry({ user_id: 'founder', action: 'DELETE_CASH_TXN', entity: 'cash_transaction', entity_id: deleteId });
    toast('Transaction deleted', 'info');
    setDeleteId(null);
  }

  function applyQuickEntry(qe: typeof settings.quick_entries[0]) {
    setForm({
      ...DEFAULT_FORM,
      type: qe.type,
      amount: qe.amount.toString(),
      category_id: qe.category_id,
      description: qe.description,
    });
    setEditingId(null);
    setErrors({});
    setModalOpen(true);
  }

  const columns: Column<CashTransaction>[] = [
    {
      key: 'date', header: 'Date', sortable: true,
      render: t => <span className="text-xs text-[#666]">{formatDate(t.date)}</span>
    },
    {
      key: 'type', header: 'Type',
      render: t => (
        <Badge variant={t.type === 'Cash In' ? 'green' : 'red'}>{t.type}</Badge>
      )
    },
    {
      key: 'description', header: 'Description',
      render: t => (
        <div>
          <p className="text-sm text-[#070707]">{t.description || t.party}</p>
          <p className="text-xs text-[#888]">{t.party}</p>
        </div>
      )
    },
    {
      key: 'category', header: 'Category',
      render: t => {
        const cat = categories.find(c => c.id === t.category_id);
        return <span className="text-xs text-[#555]">{cat?.name || t.category_id}</span>;
      }
    },
    {
      key: 'amount', header: 'Amount', align: 'right', sortable: true,
      render: t => (
        <span className={`font-medium tabular-nums ${t.type === 'Cash In' ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
          {t.type === 'Cash In' ? '+' : '-'}{formatCurrency(t.amount)}
        </span>
      )
    },
    {
      key: 'actions', header: '', align: 'right',
      render: t => (
        <div className="flex items-center gap-2 justify-end">
          <button onClick={e => { e.stopPropagation(); openEdit(t); }} className="text-[#888] hover:text-[#070707]">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); setDeleteId(t.id); }} className="text-[#888] hover:text-[#DC2626]">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )
    },
  ];

  return (
    <div className="p-6 max-w-[1200px]">
      <PageHeader
        title="Cash Transactions"
        subtitle={`Cash holder: ${settings.cash_holder}`}
        actions={
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAdd}>
            Add Transaction
          </Button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Cash in Hand" value={formatCurrency(cashBalance, true)} accent="teal" icon={<Wallet className="w-4 h-4" />} />
        <MetricCard label="Cash In" value={formatCurrency(monthMetrics.cashIn, true)} sub={filterMonth} accent="green" />
        <MetricCard label="Cash Out" value={formatCurrency(monthMetrics.cashOut, true)} sub={filterMonth} accent="red" />
        <MetricCard label="Transactions" value={String(monthMetrics.count)} sub={filterMonth} />
      </div>

      {/* Quick entries */}
      {settings.quick_entries.length > 0 && (
        <Card className="mb-5">
          <p className="text-xs font-medium text-[#888] uppercase tracking-wide mb-3">Quick Entry</p>
          <div className="flex flex-wrap gap-2">
            {settings.quick_entries.map(qe => (
              <button
                key={qe.id}
                onClick={() => applyQuickEntry(qe)}
                className="px-3 py-1.5 text-xs border border-[#e0e0e0] text-[#555] hover:border-[#16C4BA] hover:text-[#16C4BA] transition-colors"
              >
                {qe.label} · {formatCurrency(qe.amount)}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Filter className="w-4 h-4 text-[#888]" />
        <input
          type="month"
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="px-3 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]"
        />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]"
        >
          <option value="">All types</option>
          <option value="Cash In">Cash In</option>
          <option value="Cash Out">Cash Out</option>
        </select>
        <span className="text-xs text-[#888]">{filtered.length} transactions</span>
      </div>

      <Table
        columns={columns}
        data={filtered}
        keyExtractor={t => t.id}
        emptyMessage="No cash transactions yet. Use Quick Entry or add one manually."
      />

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Transaction' : 'New Cash Transaction'}
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} loading={loading}>
              {editingId ? 'Save Changes' : 'Add Transaction'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date"
              type="date"
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
            />
            <Select
              label="Type"
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value as CashType })}
              options={[{ value: 'Cash In', label: 'Cash In' }, { value: 'Cash Out', label: 'Cash Out' }]}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Amount (₹)"
              type="number"
              placeholder="0"
              value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
              error={errors.amount}
            />
            <Select
              label="Category"
              value={form.category_id}
              onChange={e => setForm({ ...form, category_id: e.target.value })}
              options={catOptions}
              placeholder="Select category"
              error={errors.category_id}
            />
          </div>

          <Input
            label="Who (party)"
            placeholder="Vendor name, client, team member..."
            value={form.party}
            onChange={e => setForm({ ...form, party: e.target.value })}
            error={errors.party}
          />

          <Textarea
            label="Description"
            placeholder="What was this for?"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            rows={2}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Vertical"
              value={form.vertical}
              onChange={e => setForm({ ...form, vertical: e.target.value })}
              options={VERTICALS}
            />
            <Input
              label="Tags (comma separated)"
              placeholder="client-name, project..."
              value={form.tags}
              onChange={e => setForm({ ...form, tags: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Transaction"
        message="Are you sure you want to delete this transaction? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
