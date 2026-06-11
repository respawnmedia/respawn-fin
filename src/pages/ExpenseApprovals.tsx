import React, { useState, useMemo } from 'react';
import { Plus, Check, X, Clock, Filter, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Card, MetricCard } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import {
  getExpenseApprovals, addExpenseApproval, updateExpenseApproval,
  getCategories, getClients, addCashTransaction, addAuditEntry,
} from '@/lib/storage';
import type { ApprovalStatus, ExpenseApproval } from '@/lib/storage';
import { formatCurrency, formatDate } from '@/utils/format';

const STATUS_COLORS: Record<ApprovalStatus, string> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
};

export function ExpenseApprovalsPage() {
  const toast = useToast();
  const [submitModal, setSubmitModal] = useState(false);
  const [reviewModal, setReviewModal] = useState<ExpenseApproval | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [rejectionReason, setRejectionReason] = useState('');

  const categories = getCategories().filter(c => c.type === 'expense' || c.type === 'both');
  const clients = getClients().filter(c => c.status === 'active');

  const emptyForm = {
    submitted_by: '', date: new Date().toISOString().split('T')[0],
    amount: '', category_id: '', party: '', description: '',
    purpose: '', client_id: '', receipt_description: '',
  };
  const [form, setForm] = useState(emptyForm);

  const approvals = getExpenseApprovals();

  const filtered = useMemo(() => {
    return approvals.filter(a => !filterStatus || a.status === filterStatus)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [approvals, filterStatus]);

  const metrics = useMemo(() => {
    const pending = approvals.filter(a => a.status === 'pending');
    const approved = approvals.filter(a => a.status === 'approved');
    const pendingAmount = pending.reduce((s, a) => s + a.amount, 0);
    const approvedAmount = approved.reduce((s, a) => s + a.amount, 0);
    return { pendingCount: pending.length, pendingAmount, approvedAmount };
  }, [approvals]);

  function submitExpense() {
    if (!form.amount || !form.party || !form.description) {
      toast('Fill in amount, party, and description', 'error'); return;
    }
    const e = addExpenseApproval({
      submitted_by: form.submitted_by || 'Team',
      date: form.date, amount: Number(form.amount),
      category_id: form.category_id, party: form.party.trim(),
      description: form.description.trim(), purpose: form.purpose.trim(),
      client_id: form.client_id || undefined,
      receipt_description: form.receipt_description,
      status: 'pending',
    });
    addAuditEntry({ user_id: form.submitted_by || 'team', action: 'SUBMIT_EXPENSE', entity: 'expense_approval', entity_id: e.id });
    toast('Expense submitted for approval', 'success');
    setSubmitModal(false);
    setForm(emptyForm);
  }

  function approve(approval: ExpenseApproval) {
    // Create the actual cash transaction
    addCashTransaction({
      date: approval.date, type: 'Cash Out', amount: approval.amount,
      category_id: approval.category_id, party: approval.party,
      description: approval.description, reason: approval.purpose,
      client_id: approval.client_id, tags: ['approved-expense'],
      created_by: 'founder',
    });
    updateExpenseApproval(approval.id, {
      status: 'approved', reviewed_by: 'founder',
      reviewed_at: new Date().toISOString(),
    });
    addAuditEntry({ user_id: 'founder', action: 'APPROVE_EXPENSE', entity: 'expense_approval', entity_id: approval.id });
    toast(`Approved ${formatCurrency(approval.amount)} — added to cash transactions`, 'success');
    setReviewModal(null);
  }

  function reject(approval: ExpenseApproval) {
    updateExpenseApproval(approval.id, {
      status: 'rejected', reviewed_by: 'founder',
      reviewed_at: new Date().toISOString(),
      rejection_reason: rejectionReason || 'Rejected by founder',
    });
    addAuditEntry({ user_id: 'founder', action: 'REJECT_EXPENSE', entity: 'expense_approval', entity_id: approval.id });
    toast('Expense rejected', 'info');
    setReviewModal(null);
    setRejectionReason('');
  }

  return (
    <div className="p-4 lg:p-6 max-w-[900px]">
      <PageHeader
        title="Expense Approvals"
        subtitle="Team submits expenses · founders approve · auto-adds to cash ledger"
        actions={
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setSubmitModal(true)}>
            Submit Expense
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <MetricCard label="Pending Approval" value={String(metrics.pendingCount)} sub={formatCurrency(metrics.pendingAmount, true)} accent="amber" icon={<Clock className="w-4 h-4" />} />
        <MetricCard label="Approved (All Time)" value={formatCurrency(metrics.approvedAmount, true)} accent="green" />
        <MetricCard label="Total Submitted" value={String(approvals.length)} />
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(['pending', 'approved', 'rejected', ''] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 text-xs transition-colors ${filterStatus === s ? 'bg-[#070707] text-white' : 'border border-[#ddd] text-[#555] hover:border-[#070707]'}`}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[#888] text-sm">No expenses to review.</p>
        </Card>
      ) : (
        <div className="border border-[#e8e8e8]">
          {filtered.map((a, i) => {
            const client = clients.find(c => c.id === a.client_id);
            const cat = categories.find(c => c.id === a.category_id);
            return (
              <div key={a.id} className={`px-5 py-4 ${i > 0 ? 'border-t border-[#f0f0f0]' : ''} hover:bg-[#fafafa]`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-[#070707]">{a.description}</span>
                      <Badge variant={STATUS_COLORS[a.status] as 'amber' | 'green' | 'red'}>{a.status}</Badge>
                      {client && <Badge variant="blue">{client.name}</Badge>}
                    </div>
                    <div className="text-xs text-[#888] space-y-0.5">
                      <p>By <strong className="text-[#555]">{a.submitted_by}</strong> · {formatDate(a.date)} · {a.party}</p>
                      {a.purpose && <p className="italic">Purpose: {a.purpose}</p>}
                      {cat && <p>Category: {cat.name}</p>}
                      {a.status === 'rejected' && a.rejection_reason && (
                        <p className="text-[#DC2626]">Rejected: {a.rejection_reason}</p>
                      )}
                      {a.status === 'approved' && a.reviewed_at && (
                        <p className="text-[#16A34A]">Approved {formatDate(a.reviewed_at.split('T')[0])}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="font-bold text-base tabular-nums">{formatCurrency(a.amount)}</span>
                    {a.status === 'pending' && (
                      <button onClick={() => { setReviewModal(a); setRejectionReason(''); }}
                        className="px-3 py-1.5 text-xs bg-[#16C4BA] text-[#070707] font-medium hover:bg-[#13b0a7]">
                        Review
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Submit Modal */}
      <Modal open={submitModal} onClose={() => setSubmitModal(false)} title="Submit Expense" width="md"
        footer={<>
          <Button variant="ghost" onClick={() => setSubmitModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={submitExpense}>Submit for Approval</Button>
        </>}>
        <div className="space-y-4">
          <div className="bg-[#f7f7f5] px-3 py-2 text-xs text-[#888]">
            Expenses submitted here go into a pending queue. A founder reviews and approves, at which point it's automatically added to the cash ledger.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Submitted By" value={form.submitted_by} onChange={e => setForm({ ...form, submitted_by: e.target.value })} placeholder="Your name" />
            <Input label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Amount (₹)" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" />
            <Select label="Category" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
              options={categories.map(c => ({ value: c.id, label: c.name }))} placeholder="Select category" />
          </div>
          <Input label="Paid to (party)" value={form.party} onChange={e => setForm({ ...form, party: e.target.value })} placeholder="Vendor, freelancer, store..." />
          <Input label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What was bought / what service?" />
          <Input label="Purpose (context)" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} placeholder="e.g. Shoot for Tissera June campaign, travel for client meeting" />
          <Select label="Client (optional)" value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}
            options={[{ value: '', label: 'Not for a specific client' }, ...clients.map(c => ({ value: c.id, label: c.name }))]} />
          <Input label="Receipt description" value={form.receipt_description} onChange={e => setForm({ ...form, receipt_description: e.target.value })} placeholder="Physical receipt with Ravi, WhatsApp screenshot saved, etc." />
        </div>
      </Modal>

      {/* Review Modal */}
      <Modal open={!!reviewModal} onClose={() => setReviewModal(null)} title="Review Expense" width="md"
        footer={<>
          <Button variant="danger" icon={<X className="w-4 h-4" />} onClick={() => reviewModal && reject(reviewModal)}>Reject</Button>
          <Button variant="primary" icon={<Check className="w-4 h-4" />} onClick={() => reviewModal && approve(reviewModal)}>
            Approve & Add to Cash
          </Button>
        </>}>
        {reviewModal && (
          <div className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-[#f0f0f0] pb-2">
                <span className="text-[#888]">Amount</span>
                <span className="font-bold text-lg">{formatCurrency(reviewModal.amount)}</span>
              </div>
              <div className="flex justify-between"><span className="text-[#888]">Submitted by</span><span>{reviewModal.submitted_by}</span></div>
              <div className="flex justify-between"><span className="text-[#888]">Date</span><span>{formatDate(reviewModal.date)}</span></div>
              <div className="flex justify-between"><span className="text-[#888]">Paid to</span><span>{reviewModal.party}</span></div>
              <div className="flex justify-between"><span className="text-[#888]">Description</span><span>{reviewModal.description}</span></div>
              {reviewModal.purpose && <div className="flex justify-between"><span className="text-[#888]">Purpose</span><span className="text-right max-w-[60%]">{reviewModal.purpose}</span></div>}
              {reviewModal.client_id && <div className="flex justify-between"><span className="text-[#888]">Client</span><span>{clients.find(c => c.id === reviewModal.client_id)?.name}</span></div>}
              {reviewModal.receipt_description && <div className="flex justify-between"><span className="text-[#888]">Receipt</span><span className="text-[#555]">{reviewModal.receipt_description}</span></div>}
            </div>
            <div className="bg-[#f7f7f5] px-3 py-2 text-xs text-[#888]">
              Approving will automatically create a Cash Out transaction and link it to the client cost sheet if a client is specified.
            </div>
            <Textarea label="Rejection reason (only if rejecting)" value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)} rows={2} placeholder="Optional — explain why..." />
          </div>
        )}
      </Modal>
    </div>
  );
}
