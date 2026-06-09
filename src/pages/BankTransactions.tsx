import React, { useState, useCallback, useMemo } from 'react';
import { Upload, Check, AlertTriangle, Edit2, Trash2, Filter, FileText } from 'lucide-react';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Card, MetricCard } from '@/components/ui/Card';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Table, Column } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import {
  getBankStatements, addBankStatement, updateBankStatement,
  getBankTransactions, getBankTransactionsByStatement, addBankTransactions,
  updateBankTransaction, deleteBankTransaction, getCategories,
  getNarrationMap, upsertNarrationMap, addAuditEntry
} from '@/lib/storage';
import { formatCurrency, formatDate, currentMonth } from '@/utils/format';
import type { BankTransaction } from '@/types';

// Extracted transaction before commit
interface ExtractedTxn {
  date: string;
  narration: string;
  debit: number;
  credit: number;
  balance: number;
  ref_no: string;
  category_id: string;
  confidence_score: number;
  flagged?: boolean;
}

export function BankTransactionsPage() {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [reviewData, setReviewData] = useState<ExtractedTxn[] | null>(null);
  const [reviewStatementId, setReviewStatementId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [filterCategory, setFilterCategory] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editTxn, setEditTxn] = useState<BankTransaction | null>(null);
  const [committing, setCommitting] = useState(false);

  const categories = getCategories();
  const statements = getBankStatements();
  const allTxns = getBankTransactions();
  const narrationMap = getNarrationMap();

  const catOptions = categories.map(c => ({ value: c.id, label: c.name }));
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

  const filteredTxns = useMemo(() => {
    return allTxns.filter(t => {
      if (filterMonth && !t.date.startsWith(filterMonth)) return false;
      if (filterCategory && t.category_id !== filterCategory) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allTxns, filterMonth, filterCategory]);

  const monthMetrics = useMemo(() => {
    const m = allTxns.filter(t => t.date.startsWith(filterMonth));
    const inflow = m.reduce((s, t) => s + t.credit, 0);
    const outflow = m.reduce((s, t) => s + t.debit, 0);
    const lastBalance = m.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.balance || 0;
    return { inflow, outflow, net: inflow - outflow, lastBalance, count: m.length };
  }, [allTxns, filterMonth]);

  // Auto-suggest category from narration
  function suggestCategory(narration: string): string {
    const lower = narration.toLowerCase();
    const match = narrationMap.find(m => lower.includes(m.narration_pattern.toLowerCase()));
    if (match) return match.category_id;
    // Default heuristics
    if (lower.includes('salary') || lower.includes('sal/')) return categories.find(c => c.name === 'Salaries')?.id || '';
    if (lower.includes('zomato') || lower.includes('swiggy')) return categories.find(c => c.name === 'Food & Cafes')?.id || '';
    if (lower.includes('google') || lower.includes('aws') || lower.includes('notion')) return categories.find(c => c.name === 'Software & Tools')?.id || '';
    if (lower.includes('uber') || lower.includes('ola') || lower.includes('auto')) return categories.find(c => c.name === 'Travel')?.id || '';
    if (lower.includes('rent') || lower.includes('office')) return categories.find(c => c.name === 'Office Rent')?.id || '';
    if (lower.includes('transfer')) return categories.find(c => c.name === 'Internal Transfer')?.id || '';
    return categories.find(c => c.name === 'Other')?.id || '';
  }

  async function handleFileUpload(file: File) {
    if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
      toast('Please upload a PDF bank statement', 'error');
      return;
    }

    setUploading(true);
    setUploadProgress('Reading PDF...');

    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve((e.target?.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setUploadProgress('Sending to AI for extraction...');

      // Call serverless function
      const response = await fetch('/api/extract-bank-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64, fileName: file.name }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Extraction failed');
      }

      const { transactions, bankName, month } = await response.json();

      // Create statement record
      const stmt = addBankStatement({
        bank_name: bankName || 'Unknown Bank',
        statement_month: month || currentMonth(),
        status: 'review',
      });

      // Add suggested categories from narration
      const withCategories: ExtractedTxn[] = transactions.map((t: ExtractedTxn) => ({
        ...t,
        category_id: suggestCategory(t.narration),
        flagged: t.confidence_score < 0.7,
      }));

      setReviewData(withCategories);
      setReviewStatementId(stmt.id);
      setUploadProgress('');
      toast(`Extracted ${transactions.length} transactions from ${bankName || 'statement'}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Extraction failed';
      toast(msg, 'error');
      setUploadProgress('');
    } finally {
      setUploading(false);
    }
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
      statement_id: reviewStatementId,
      date: t.date,
      narration: t.narration,
      debit: t.debit,
      credit: t.credit,
      balance: t.balance,
      ref_no: t.ref_no,
      category_id: t.category_id,
      vertical: undefined,
      tags: [],
      confidence_score: t.confidence_score,
    }));

    addBankTransactions(txns);
    updateBankStatement(reviewStatementId, { status: 'committed' });

    // Learn from category assignments
    reviewData.forEach(t => {
      if (t.category_id && t.category_id !== 'other') {
        const key = t.narration.slice(0, 20).toLowerCase();
        upsertNarrationMap(key, t.category_id);
      }
    });

    addAuditEntry({ user_id: 'founder', action: 'COMMIT_BANK_STATEMENT', entity: 'bank_statement', entity_id: reviewStatementId, metadata: { count: txns.length } });
    toast(`${txns.length} transactions committed`, 'success');
    setReviewData(null);
    setReviewStatementId(null);
    setCommitting(false);
  }

  const columns: Column<BankTransaction>[] = [
    {
      key: 'date', header: 'Date', sortable: true,
      render: t => <span className="text-xs text-[#666]">{formatDate(t.date)}</span>
    },
    {
      key: 'narration', header: 'Narration',
      render: t => (
        <div className="max-w-[280px]">
          <p className="text-sm text-[#070707] truncate">{t.narration}</p>
          {t.ref_no && <p className="text-xs text-[#888]">Ref: {t.ref_no}</p>}
        </div>
      )
    },
    {
      key: 'category', header: 'Category',
      render: t => (
        <span className="text-xs text-[#555]">{catMap[t.category_id] || t.category_id}</span>
      )
    },
    {
      key: 'debit', header: 'Debit', align: 'right',
      render: t => t.debit > 0 ? <span className="text-[#DC2626] tabular-nums">{formatCurrency(t.debit)}</span> : <span className="text-[#ccc]">—</span>
    },
    {
      key: 'credit', header: 'Credit', align: 'right',
      render: t => t.credit > 0 ? <span className="text-[#16A34A] tabular-nums">{formatCurrency(t.credit)}</span> : <span className="text-[#ccc]">—</span>
    },
    {
      key: 'balance', header: 'Balance', align: 'right',
      render: t => <span className="tabular-nums text-sm">{formatCurrency(t.balance)}</span>
    },
    {
      key: 'actions', header: '', align: 'right',
      render: t => (
        <button onClick={() => setDeleteId(t.id)} className="text-[#888] hover:text-[#DC2626]">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )
    },
  ];

  // Review table columns
  const reviewColumns: Column<ExtractedTxn & { idx: number }>[] = [
    {
      key: 'date', header: 'Date',
      render: t => <span className="text-xs">{t.date}</span>
    },
    {
      key: 'narration', header: 'Narration',
      render: t => (
        <div className="flex items-center gap-2 max-w-[240px]">
          {t.flagged && <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B] flex-shrink-0" />}
          <span className="text-xs truncate">{t.narration}</span>
        </div>
      )
    },
    {
      key: 'category', header: 'Category',
      render: t => (
        <select
          value={t.category_id}
          onChange={e => {
            const updated = [...(reviewData || [])];
            updated[t.idx].category_id = e.target.value;
            setReviewData(updated);
          }}
          className="text-xs border border-[#ddd] px-2 py-1 focus:outline-none focus:border-[#16C4BA]"
        >
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )
    },
    {
      key: 'debit', header: 'Debit', align: 'right',
      render: t => t.debit > 0 ? <span className="text-[#DC2626] text-xs tabular-nums">{formatCurrency(t.debit)}</span> : <span className="text-[#ccc] text-xs">—</span>
    },
    {
      key: 'credit', header: 'Credit', align: 'right',
      render: t => t.credit > 0 ? <span className="text-[#16A34A] text-xs tabular-nums">{formatCurrency(t.credit)}</span> : <span className="text-[#ccc] text-xs">—</span>
    },
    {
      key: 'balance', header: 'Balance', align: 'right',
      render: t => <span className="text-xs tabular-nums">{formatCurrency(t.balance)}</span>
    },
    {
      key: 'remove', header: '',
      render: t => (
        <button onClick={() => {
          const updated = (reviewData || []).filter((_, i) => i !== t.idx);
          setReviewData(updated);
        }} className="text-[#888] hover:text-[#DC2626]">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )
    },
  ];

  // If in review mode, show review screen
  if (reviewData) {
    const reviewWithIndex = reviewData.map((t, idx) => ({ ...t, idx }));
    const flaggedCount = reviewData.filter(t => t.flagged).length;
    const totalCredit = reviewData.reduce((s, t) => s + t.credit, 0);
    const totalDebit = reviewData.reduce((s, t) => s + t.debit, 0);

    return (
      <div className="p-6 max-w-[1200px]">
        <PageHeader
          title="Review Extracted Transactions"
          subtitle="Verify categories and remove any incorrect rows before committing"
          actions={
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => { setReviewData(null); setReviewStatementId(null); }}>
                Discard
              </Button>
              <Button variant="primary" icon={<Check className="w-4 h-4" />} onClick={commitReview} loading={committing}>
                Commit {reviewData.length} Transactions
              </Button>
            </div>
          }
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <MetricCard label="Extracted" value={String(reviewData.length)} sub="transactions" />
          <MetricCard label="Total Credit" value={formatCurrency(totalCredit, true)} accent="green" />
          <MetricCard label="Total Debit" value={formatCurrency(totalDebit, true)} accent="red" />
          {flaggedCount > 0 && <MetricCard label="Flagged" value={String(flaggedCount)} sub="low confidence" accent="amber" />}
        </div>

        {flaggedCount > 0 && (
          <div className="mb-4 bg-[#fef3c7] border border-[#F59E0B] px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-[#d97706]" />
            <span className="text-sm text-[#92400e]">
              {flaggedCount} transaction{flaggedCount > 1 ? 's' : ''} flagged with low confidence — please verify their categories.
            </span>
          </div>
        )}

        <Table
          columns={reviewColumns}
          data={reviewWithIndex}
          keyExtractor={(row) => String(row.idx)}
          emptyMessage="No transactions to review."
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px]">
      <PageHeader
        title="Bank Transactions"
        subtitle="Upload monthly bank statements for AI-powered extraction"
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total Inflow" value={formatCurrency(monthMetrics.inflow, true)} accent="green" />
        <MetricCard label="Total Outflow" value={formatCurrency(monthMetrics.outflow, true)} accent="red" />
        <MetricCard label="Net" value={formatCurrency(monthMetrics.net, true)} accent={monthMetrics.net >= 0 ? 'green' : 'red'} />
        <MetricCard label="Last Balance" value={formatCurrency(monthMetrics.lastBalance, true)} />
      </div>

      {/* Upload zone */}
      <Card className="mb-6">
        <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
          Upload Bank Statement (PDF)
        </h3>
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-[#ddd] p-8 text-center hover:border-[#16C4BA] transition-colors"
        >
          {uploading ? (
            <div className="space-y-2">
              <div className="w-8 h-8 border-2 border-[#16C4BA] border-t-transparent mx-auto animate-spin" />
              <p className="text-sm text-[#888]">{uploadProgress}</p>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-[#ccc] mx-auto mb-3" />
              <p className="text-sm text-[#555] mb-1">Drag & drop a bank statement PDF here</p>
              <p className="text-xs text-[#888] mb-4">Supports HDFC, ICICI, SBI, Kotak, Axis and more</p>
              <label className="cursor-pointer">
                <span className="px-4 py-2 text-sm bg-[#070707] text-white hover:bg-[#1a1a1a] transition-colors">
                  Choose File
                </span>
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                />
              </label>
            </>
          )}
        </div>

        {/* Past statements */}
        {statements.length > 0 && (
          <div className="mt-4 border-t border-[#f0f0f0] pt-4">
            <p className="text-xs font-medium text-[#888] uppercase tracking-wide mb-2">Past Statements</p>
            <div className="space-y-1">
              {statements.slice(0, 5).map(s => (
                <div key={s.id} className="flex items-center justify-between text-sm py-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#888]" />
                    <span>{s.bank_name} — {s.statement_month}</span>
                  </div>
                  <Badge variant={s.status === 'committed' ? 'green' : s.status === 'review' ? 'amber' : 'gray'}>
                    {s.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

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
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]"
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="text-xs text-[#888]">{filteredTxns.length} transactions</span>
      </div>

      <Table
        columns={columns}
        data={filteredTxns}
        keyExtractor={t => t.id}
        emptyMessage="No bank transactions yet. Upload a PDF statement to get started."
      />

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) {
            deleteBankTransaction(deleteId);
            addAuditEntry({ user_id: 'founder', action: 'DELETE_BANK_TXN', entity: 'bank_transaction', entity_id: deleteId });
            toast('Transaction deleted', 'info');
            setDeleteId(null);
          }
        }}
        title="Delete Transaction"
        message="Delete this bank transaction? This cannot be undone."
      />
    </div>
  );
}
