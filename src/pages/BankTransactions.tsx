import React, { useState, useCallback, useMemo } from 'react';
import { Upload, Check, AlertTriangle, Edit2, Trash2, Filter, FileText, BarChart2, ChevronDown, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Card, MetricCard } from '@/components/ui/Card';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { PaymentSuggestionDialog } from '@/components/ui/PaymentSuggestionDialog';
import { detectClientPayment, detectSharedExpense, type PaymentSuggestion } from '@/lib/payment-detector';
import {
  getBankStatements, addBankStatement, updateBankStatement,
  getBankTransactions, addBankTransactions,
  updateBankTransaction, deleteBankTransaction,
  getCategories, getNarrationMap, upsertNarrationMap, addAuditEntry,
  getClients, upsertClientMonthlyCost, getClientMonthlyCosts,
} from '@/lib/storage';
import { autoLinkToCosting } from '@/lib/auto-cost-link';
import { formatCurrency, formatDate, currentMonth, formatMonth, monthsAgo } from '@/utils/format';
import { addPaymentRecord } from '@/lib/payments';
import type { BankTransaction } from '@/types';

interface ExtractedTxn {
  date: string; narration: string; debit: number; credit: number;
  balance: number; ref_no: string; category_id: string; confidence_score: number; flagged?: boolean;
}

export function BankTransactionsPage() {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [reviewData, setReviewData] = useState<ExtractedTxn[] | null>(null);
  const [reviewStatementId, setReviewStatementId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [filterCategory, setFilterCategory] = useState('');
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editTxn, setEditTxn] = useState<BankTransaction | null>(null);
  const [committing, setCommitting] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [editForm, setEditForm] = useState({ category_id: '', reason: '', narration: '', client_id: '', purpose: '' });
  const [paymentSuggestions, setPaymentSuggestions] = useState<PaymentSuggestion[]>([]);
  const [currentSuggestionIdx, setCurrentSuggestionIdx] = useState(0);

  const categories = getCategories();
  const statements = getBankStatements();
  const allTxns = getBankTransactions();
  const narrationMap = getNarrationMap();
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const catOptions = categories.map(c => ({ value: c.id, label: c.name }));

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filteredTxns = useMemo(() => {
    return allTxns.filter(t => {
      if (viewMode === 'month') {
        if (filterMonth && !t.date.startsWith(filterMonth)) return false;
      } else {
        if (!t.date.startsWith(selectedYear)) return false;
      }
      if (filterCategory && t.category_id !== filterCategory) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allTxns, filterMonth, filterCategory, viewMode, selectedYear]);

  // ── Metrics ────────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const inflow = filteredTxns.reduce((s, t) => s + t.credit, 0);
    const outflow = filteredTxns.reduce((s, t) => s + t.debit, 0);
    const lastBalance = filteredTxns[0]?.balance || 0;
    return { inflow, outflow, net: inflow - outflow, lastBalance, count: filteredTxns.length };
  }, [filteredTxns]);

  // ── Year analytics ────────────────────────────────────────────────────────
  const yearAnalytics = useMemo(() => {
    if (viewMode !== 'year') return [];
    const months = Array.from({ length: 12 }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, '0')}`);
    return months.map(month => {
      const mTxns = allTxns.filter(t => t.date.startsWith(month));
      const inflow = mTxns.reduce((s, t) => s + t.credit, 0);
      const outflow = mTxns.reduce((s, t) => s + t.debit, 0);
      return { month, label: formatMonth(month), inflow, outflow, net: inflow - outflow, count: mTxns.length };
    });
  }, [allTxns, viewMode, selectedYear]);

  // ── Category analytics ────────────────────────────────────────────────────
  const categoryAnalytics = useMemo(() => {
    const breakdown: Record<string, { amount: number; count: number }> = {};
    filteredTxns.filter(t => t.debit > 0).forEach(t => {
      const name = catMap[t.category_id] || 'Uncategorized';
      if (!breakdown[name]) breakdown[name] = { amount: 0, count: 0 };
      breakdown[name].amount += t.debit;
      breakdown[name].count++;
    });
    return Object.entries(breakdown)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredTxns, catMap]);

  // ── Auto-suggest category ─────────────────────────────────────────────────
  function suggestCategory(narration: string): string {
    const lower = narration.toLowerCase();
    // Check learned patterns first
    const match = narrationMap.find(m => lower.includes(m.narration_pattern.toLowerCase()));
    if (match) return match.category_id;
    // Built-in heuristics
    const rules: [string[], string][] = [
      [['salary', 'sal/', 'payroll'], 'Salaries'],
      [['zomato', 'swiggy', 'food', 'cafe', 'restaurant', 'barbeque', 'pizza'], 'Food & Cafes'],
      [['google', 'aws', 'notion', 'adobe', 'slack', 'figma', 'zoom', 'microsoft'], 'Software & Tools'],
      [['uber', 'ola', 'auto', 'rapido', 'namma yatri', 'irctc'], 'Travel'],
      [['rent', 'maintenance', 'chetpet', 'office'], 'Office Rent'],
      [['transfer', 'neft', 'imps', 'rtgs'], 'Internal Transfer'],
      [['freelance', 'freelancer', 'video edit', 'editor', 'photographer', 'videograph'], 'Freelancer Fees'],
      [['shoot', 'production', 'studio'], 'Shoot Costs'],
      [['bank charge', 'bank fee', 'gst on', 'interest'], 'Bank Charges'],
    ];
    for (const [keywords, catName] of rules) {
      if (keywords.some(k => lower.includes(k))) {
        const cat = categories.find(c => c.name === catName);
        if (cat) return cat.id;
      }
    }
    return categories.find(c => c.name === 'Other')?.id || '';
  }

  async function handleFileUpload(file: File) {
    if (!file.name.endsWith('.pdf')) { toast('Please upload a PDF bank statement', 'error'); return; }
    setUploading(true); setUploadProgress('Reading PDF...');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve((e.target?.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setUploadProgress('Extracting transactions with AI...');
      const response = await fetch('/api/extract-bank-statement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64, fileName: file.name }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({ error: 'Extraction failed' }))).error);
      const { transactions, bankName, month } = await response.json();
      const stmt = addBankStatement({ bank_name: bankName || 'Unknown Bank', statement_month: month || currentMonth(), status: 'review' });
      const withCategories: ExtractedTxn[] = transactions.map((t: ExtractedTxn) => ({
        ...t, category_id: suggestCategory(t.narration), flagged: t.confidence_score < 0.7,
      }));
      setReviewData(withCategories);
      setReviewStatementId(stmt.id);
      setUploadProgress('');
      toast(`Extracted ${transactions.length} transactions`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Extraction failed', 'error');
      setUploadProgress('');
    } finally { setUploading(false); }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }

  async function commitReview() {
    if (!reviewData || !reviewStatementId) return;
    setCommitting(true);
    const txns = reviewData.map(t => ({
      statement_id: reviewStatementId!, date: t.date, narration: t.narration,
      debit: t.debit, credit: t.credit, balance: t.balance, ref_no: t.ref_no,
      category_id: t.category_id, tags: [] as string[], confidence_score: t.confidence_score,
    }));
    const newTxns = addBankTransactions(txns);
    // Auto-link any client-tagged transactions to cost sheets
    newTxns.forEach(t => autoLinkToCosting(t, 'bank'));
    updateBankStatement(reviewStatementId, { status: 'committed' });

    // Detect potential client payments from credit transactions
    const creditTxns = newTxns.filter(t => t.credit > 0);
    const suggestions: PaymentSuggestion[] = [];
    for (const t of creditTxns) {
      const s = detectClientPayment('', t.narration, t.narration, t.credit, t.date, 'in');
      if (s) suggestions.push(s);
    }
    // Detect shared expenses from large debit transactions (production, shoots, etc.)
    const debitTxns = newTxns.filter(t => t.debit > 1000 && !t.client_id);
    for (const t of debitTxns) {
      const s = detectSharedExpense('', t.narration, t.narration, t.debit, t.date);
      if (s) suggestions.push({ ...s, match_reason: `${t.narration.slice(0, 50)} — ${s.match_reason}` });
    }
    if (suggestions.length > 0) {
      setPaymentSuggestions(suggestions);
      setCurrentSuggestionIdx(0);
    }
    // Learn category patterns
    reviewData.forEach(t => {
      if (t.category_id) {
        const key = t.narration.slice(0, 25).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        if (key.length > 3) upsertNarrationMap(key, t.category_id);
      }
    });
    addAuditEntry({ user_id: 'founder', action: 'COMMIT_BANK_STATEMENT', entity: 'bank_statement', entity_id: reviewStatementId, metadata: { count: txns.length } });
    toast(`${txns.length} transactions committed`, 'success');
    setReviewData(null); setReviewStatementId(null); setCommitting(false);
  }

  function openEdit(t: BankTransaction) {
    setEditTxn(t);
    setEditForm({ category_id: t.category_id, reason: t.reason || '', narration: t.narration, client_id: t.client_id || '', purpose: t.reason || '' });
  }

  function saveEdit() {
    if (!editTxn) return;
    const updates = { category_id: editForm.category_id, reason: editForm.reason, narration: editForm.narration, client_id: editForm.client_id || undefined };
    updateBankTransaction(editTxn.id, updates);
    const key = editForm.narration.slice(0, 25).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    if (key.length > 3) upsertNarrationMap(key, editForm.category_id);
    const updated = { ...editTxn, ...updates };
    if (updated.client_id) autoLinkToCosting(updated, 'bank');
    toast('Transaction updated & pattern learned', 'success');
    setEditTxn(null);
  }

  // ── Review screen ──────────────────────────────────────────────────────────
  if (reviewData) {
    const flaggedCount = reviewData.filter(t => t.flagged).length;
    return (
      <div className="p-4 lg:p-6 max-w-[1200px]">
        <PageHeader
          title="Review Extracted Transactions"
          subtitle="Verify categories before committing. Changes will be learned for next time."
          actions={
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => { setReviewData(null); setReviewStatementId(null); }}>Discard</Button>
              <Button variant="primary" icon={<Check className="w-4 h-4" />} onClick={commitReview} loading={committing}>
                Commit {reviewData.length} Transactions
              </Button>
            </div>
          }
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <MetricCard label="Extracted" value={String(reviewData.length)} />
          <MetricCard label="Total Credit" value={formatCurrency(reviewData.reduce((s, t) => s + t.credit, 0), true)} accent="green" />
          <MetricCard label="Total Debit" value={formatCurrency(reviewData.reduce((s, t) => s + t.debit, 0), true)} accent="red" />
          {flaggedCount > 0 && <MetricCard label="Flagged" value={String(flaggedCount)} sub="low confidence" accent="amber" />}
        </div>
        {flaggedCount > 0 && (
          <div className="mb-4 bg-[#fef3c7] border border-[#F59E0B] px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-[#d97706]" />
            <span className="text-sm text-[#92400e]">{flaggedCount} row{flaggedCount > 1 ? 's' : ''} flagged — please check their categories.</span>
          </div>
        )}
        <div className="border border-[#e8e8e8] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] border-b border-[#e8e8e8] text-xs text-[#555] uppercase tracking-wide">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Narration</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-right px-4 py-3">Debit</th>
                <th className="text-right px-4 py-3">Credit</th>
                <th className="text-right px-4 py-3">Balance</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {reviewData.map((t, idx) => (
                <tr key={idx} className={`border-b border-[#f5f5f5] ${t.flagged ? 'bg-[#fffbeb]' : ''}`}>
                  <td className="px-4 py-2.5 text-xs text-[#666]">{t.date}</td>
                  <td className="px-4 py-2.5" style={{ maxWidth: '240px' }}>
                    <div className="flex items-start gap-1.5">
                      {t.flagged && <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B] flex-shrink-0 mt-0.5" />}
                      <span className="text-xs break-words leading-snug">{t.narration}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <select value={t.category_id}
                      onChange={e => { const u = [...reviewData]; u[idx] = { ...u[idx], category_id: e.target.value }; setReviewData(u); }}
                      className="text-xs border border-[#ddd] px-2 py-1 focus:outline-none focus:border-[#16C4BA]">
                      <option value="">— Select —</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums">{t.debit > 0 ? <span className="text-[#DC2626]">{formatCurrency(t.debit)}</span> : <span className="text-[#ccc]">—</span>}</td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums">{t.credit > 0 ? <span className="text-[#16A34A]">{formatCurrency(t.credit)}</span> : <span className="text-[#ccc]">—</span>}</td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums">{formatCurrency(t.balance)}</td>
                  <td className="px-2 py-2.5">
                    <button onClick={() => setReviewData(reviewData.filter((_, i) => i !== idx))} className="text-[#ccc] hover:text-[#DC2626]">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1200px]">
      <PageHeader title="Bank Transactions" subtitle="Upload PDF statements · AI auto-categorises · patterns are learned" />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <MetricCard label="Total Inflow" value={formatCurrency(metrics.inflow, true)} accent="green" />
        <MetricCard label="Total Outflow" value={formatCurrency(metrics.outflow, true)} accent="red" />
        <MetricCard label="Net" value={formatCurrency(metrics.net, true)} accent={metrics.net >= 0 ? 'green' : 'red'} />
        <MetricCard label="Last Balance" value={formatCurrency(metrics.lastBalance, true)} />
      </div>

      {/* Upload zone */}
      <Card className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555]">Upload Bank Statement (PDF)</h3>
          {statements.length > 0 && (
            <button onClick={() => setAnalyticsOpen(!analyticsOpen)} className="flex items-center gap-1.5 text-xs text-[#16C4BA] hover:underline">
              <BarChart2 className="w-3.5 h-3.5" /> Analytics
              {analyticsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )}
        </div>
        <div
          onDrop={handleDrop} onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-[#ddd] p-6 text-center hover:border-[#16C4BA] transition-colors">
          {uploading ? (
            <div className="space-y-2">
              <div className="w-7 h-7 border-2 border-[#16C4BA] border-t-transparent mx-auto animate-spin" />
              <p className="text-sm text-[#888]">{uploadProgress}</p>
            </div>
          ) : (
            <>
              <Upload className="w-7 h-7 text-[#ccc] mx-auto mb-2" />
              <p className="text-sm text-[#555] mb-1">Drag & drop PDF here, or choose file</p>
              <p className="text-xs text-[#888] mb-3">HDFC · ICICI · SBI · Kotak · Axis · any Indian bank</p>
              <label className="cursor-pointer">
                <span className="px-4 py-2 text-sm bg-[#070707] text-white hover:bg-[#1a1a1a] transition-colors">Choose File</span>
                <input type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
              </label>
            </>
          )}
        </div>

        {/* Past statements */}
        {statements.length > 0 && (
          <div className="mt-4 border-t border-[#f0f0f0] pt-3">
            <p className="text-xs text-[#888] uppercase tracking-wide mb-2">Past Statements</p>
            <div className="space-y-1">
              {statements.slice(0, 6).map(s => (
                <div key={s.id} className="flex items-center justify-between text-sm py-1">
                  <div className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-[#888]" /><span>{s.bank_name} — {s.statement_month}</span></div>
                  <Badge variant={s.status === 'committed' ? 'green' : s.status === 'review' ? 'amber' : 'gray'}>{s.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analytics panel */}
        {analyticsOpen && (
          <div className="mt-4 border-t border-[#f0f0f0] pt-4">
            <p className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-3">Category Breakdown (filtered view)</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {categoryAnalytics.slice(0, 8).map(c => (
                <div key={c.name} className="bg-[#f7f7f5] p-2.5">
                  <p className="text-xs text-[#555] truncate">{c.name}</p>
                  <p className="text-sm font-bold text-[#DC2626] mt-0.5">{formatCurrency(c.amount, true)}</p>
                  <p className="text-xs text-[#888]">{c.count} txn{c.count > 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* View mode + filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex">
          {(['month', 'year'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 text-xs border transition-colors ${viewMode === m ? 'bg-[#070707] text-white border-[#070707]' : 'border-[#ddd] text-[#555] hover:border-[#070707]'}`}>
              {m === 'month' ? 'Month' : 'Year'}
            </button>
          ))}
        </div>
        {viewMode === 'month' ? (
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="px-3 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
        ) : (
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
            className="px-3 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="text-xs text-[#888]">{filteredTxns.length} transactions</span>
      </div>

      {/* Year summary table */}
      {viewMode === 'year' && (
        <Card className="mb-5">
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-3">{selectedYear} — Month by Month</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e8e8e8] text-xs text-[#888] uppercase tracking-wide">
                  <th className="text-left py-2 pr-4">Month</th>
                  <th className="text-right py-2 px-3">Inflow</th>
                  <th className="text-right py-2 px-3">Outflow</th>
                  <th className="text-right py-2 px-3">Net</th>
                  <th className="text-right py-2 pl-3">Txns</th>
                </tr>
              </thead>
              <tbody>
                {yearAnalytics.filter(m => m.count > 0).map(m => (
                  <tr key={m.month} className="border-b border-[#f5f5f5] hover:bg-[#fafafa]">
                    <td className="py-2 pr-4 font-medium">{m.label}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-[#16A34A]">{formatCurrency(m.inflow)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-[#DC2626]">{formatCurrency(m.outflow)}</td>
                    <td className={`py-2 px-3 text-right tabular-nums font-medium ${m.net >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>{formatCurrency(m.net)}</td>
                    <td className="py-2 pl-3 text-right text-[#888]">{m.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Transaction table */}
      <div className="border border-[#e8e8e8] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#fafafa] border-b border-[#e8e8e8] text-xs text-[#555] uppercase tracking-wide">
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Narration</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Reason</th>
              <th className="text-right px-4 py-3">Debit</th>
              <th className="text-right px-4 py-3">Credit</th>
              <th className="text-right px-4 py-3">Balance</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {filteredTxns.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-[#888] text-sm">No transactions yet. Upload a PDF statement to get started.</td></tr>
            ) : filteredTxns.map(t => (
              <tr key={t.id} className="border-b border-[#f5f5f5] hover:bg-[#fafafa]">
                <td className="px-4 py-2.5 text-xs text-[#666] whitespace-nowrap">{formatDate(t.date)}</td>
                <td className="px-4 py-2.5" style={{ maxWidth: '280px' }}>
                  <p className="text-sm break-words leading-snug">{t.narration}</p>
                  {t.ref_no && <p className="text-xs text-[#aaa] mt-0.5">Ref: {t.ref_no}</p>}
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs px-2 py-0.5 bg-[#f0f0f0] text-[#555]">{catMap[t.category_id] || '—'}</span>
                </td>
                <td className="px-4 py-2.5 text-xs text-[#888]" style={{ maxWidth: '180px' }}>
                  <span className="break-words leading-snug">{t.reason || '—'}</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs whitespace-nowrap">{t.debit > 0 ? <span className="text-[#DC2626]">{formatCurrency(t.debit)}</span> : <span className="text-[#ccc]">—</span>}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs whitespace-nowrap">{t.credit > 0 ? <span className="text-[#16A34A]">{formatCurrency(t.credit)}</span> : <span className="text-[#ccc]">—</span>}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-sm whitespace-nowrap">{formatCurrency(t.balance)}</td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(t)} className="text-[#888] hover:text-[#070707]"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDeleteId(t.id)} className="text-[#888] hover:text-[#DC2626]"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      <Modal open={!!editTxn} onClose={() => setEditTxn(null)} title="Edit Transaction" width="md"
        footer={<><Button variant="ghost" onClick={() => setEditTxn(null)}>Cancel</Button><Button variant="primary" onClick={saveEdit}>Save & Learn</Button></>}>
        {editTxn && (
          <div className="space-y-4">
            <div className="bg-[#f7f7f5] px-3 py-2 text-sm">
              <p className="text-[#555]">{editTxn.narration}</p>
              <p className="text-xs text-[#888] mt-0.5">{formatDate(editTxn.date)} · {editTxn.debit > 0 ? <span className="text-[#DC2626]">-{formatCurrency(editTxn.debit)}</span> : <span className="text-[#16A34A]">+{formatCurrency(editTxn.credit)}</span>}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-[#555] uppercase tracking-wide block mb-1">Category</label>
              <select value={editForm.category_id} onChange={e => setEditForm({ ...editForm, category_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
                <option value="">Select category</option>
                {catOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="text-xs text-[#888] mt-1">Remembered for similar narrations next time.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-[#555] uppercase tracking-wide block mb-1">Link to Client → auto-updates cost sheet</label>
              <select value={editForm.client_id} onChange={e => setEditForm({ ...editForm, client_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
                <option value="">Not client-specific</option>
                {getClients().filter(c => c.status === 'active').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#555] uppercase tracking-wide block mb-1">Purpose / Reason</label>
              <input value={editForm.reason} onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
                placeholder="e.g. Shoot for Tissera June, Ravi's retainer, Travel for client visit"
                className="w-full px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) { deleteBankTransaction(deleteId); addAuditEntry({ user_id: 'founder', action: 'DELETE_BANK_TXN', entity: 'bank_transaction', entity_id: deleteId }); toast('Deleted', 'info'); setDeleteId(null); } }}
        title="Delete Transaction" message="Delete this transaction?" />

      {/* Client payment/expense suggestions from bank transactions */}
      {paymentSuggestions.length > 0 && currentSuggestionIdx < paymentSuggestions.length && (
        <PaymentSuggestionDialog
          suggestion={paymentSuggestions[currentSuggestionIdx]}
          direction={paymentSuggestions[currentSuggestionIdx].direction}
          totalAmount={paymentSuggestions[currentSuggestionIdx].suggested_amount}
          onAccept={(slices) => {
            const s = paymentSuggestions[currentSuggestionIdx];
            if (s.direction === 'in') {
              slices.forEach(slice => {
                addPaymentRecord({
                  client_id: slice.client_id,
                  date: new Date().toISOString().split('T')[0],
                  amount: slice.amount,
                  mode: 'Bank Transfer',
                  for_month: s.suggested_month,
                  notes: slices.length > 1
                    ? `Split: ${slices.length} clients, total ${formatCurrency(s.suggested_amount)}`
                    : 'Auto-detected from bank statement',
                });
              });
              toast(
                slices.length > 1
                  ? `Payment split across ${slices.length} clients recorded`
                  : `Payment from ${s.client_name} recorded`,
                'success'
              );
            } else {
              // Expense — allocate to cost sheets
              slices.forEach(slice => {
                if (!slice.client_id) return;
                const all = getClientMonthlyCosts();
                const existing = all.find((c: { client_id: string; month: string }) => c.client_id === slice.client_id && c.month === s.suggested_month);
                const newLine = {
                  id: crypto.randomUUID(),
                  label: slice.cost_label || 'Shared expense',
                  planned_amount: slice.amount,
                  actual_amount: slice.amount,
                  category_id: slice.category_id,
                  transaction_ids: [] as string[],
                };
                if (existing) {
                  const updatedLines = [...existing.line_items, newLine];
                  upsertClientMonthlyCost({ ...existing, line_items: updatedLines, total_cost: updatedLines.reduce((ss: number, l: { actual_amount: number }) => ss + l.actual_amount, 0) });
                } else {
                  upsertClientMonthlyCost({ client_id: slice.client_id, month: s.suggested_month, line_items: [newLine], total_cost: slice.amount });
                }
              });
              toast(`Expense allocated to ${slices.length} client cost sheet${slices.length > 1 ? 's' : ''}`, 'success');
            }
            const next = currentSuggestionIdx + 1;
            setCurrentSuggestionIdx(next);
            if (next >= paymentSuggestions.length) setPaymentSuggestions([]);
          }}
          onDismiss={() => {
            const next = currentSuggestionIdx + 1;
            setCurrentSuggestionIdx(next);
            if (next >= paymentSuggestions.length) setPaymentSuggestions([]);
          }}
        />
      )}
    </div>
  );
}
