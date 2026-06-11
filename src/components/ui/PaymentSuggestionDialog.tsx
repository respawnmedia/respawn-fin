import React, { useState, useEffect } from 'react';
import { CheckCircle, X, Plus, Trash2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { addPaymentRecord } from '@/lib/payments';
import { autoLinkToCosting } from '@/lib/auto-cost-link';
import { getClients, getCategories, addCashTransaction, updateBankTransaction } from '@/lib/storage';
import { formatCurrency, formatMonth, monthsAgo } from '@/utils/format';
import type { PaymentSuggestion } from '@/lib/payment-detector';

type SplitMode = 'equal' | 'retainer' | 'manual';
type Direction = 'in' | 'out'; // in = client payment received, out = expense shared across clients

interface ClientSlice {
  client_id: string;
  amount: number;
  cost_label: string; // which cost line this goes to on the cost sheet
  category_id: string;
}

interface PaymentSuggestionDialogProps {
  suggestion: PaymentSuggestion;
  transactionId?: string;       // bank txn id to update with client_id after confirm
  transactionType?: 'bank' | 'cash';
  direction?: Direction;        // 'in' = received, 'out' = expense
  totalAmount: number;
  onAccept: (slices: ClientSlice[]) => void;
  onDismiss: () => void;
}

export function PaymentSuggestionDialog({
  suggestion,
  transactionId,
  transactionType = 'cash',
  direction = 'in',
  totalAmount,
  onAccept,
  onDismiss,
}: PaymentSuggestionDialogProps) {
  const clients = getClients().filter(c => c.status === 'active');
  const categories = getCategories();

  // Months dropdown
  const monthOptions = [0, 1, 2].map(i => {
    const m = monthsAgo(i);
    return { value: m, label: formatMonth(m) };
  });

  // ── State ──────────────────────────────────────────────────────────────────
  const [forMonth, setForMonth] = useState(suggestion.suggested_month);
  const [mode, setMode] = useState<'UPI' | 'Bank Transfer' | 'Cash' | 'Cheque'>('Cash');
  const [splitMode, setSplitMode] = useState<SplitMode>('manual');
  const [expanded, setExpanded] = useState(true);

  // Slices: start with the suggested client
  const [slices, setSlices] = useState<ClientSlice[]>([{
    client_id: suggestion.client_id,
    amount: totalAmount,
    cost_label: direction === 'out' ? 'Shoot' : '',
    category_id: categories.find(c => ['Shoot Costs', 'Freelancer Fees'].includes(c.name))?.id || '',
  }]);

  const allocated = slices.reduce((s, sl) => s + sl.amount, 0);
  const remaining = totalAmount - allocated;
  const isBalanced = Math.abs(remaining) < 1;

  // ── Split helpers ──────────────────────────────────────────────────────────
  function rebalance(newSlices: ClientSlice[], mode: SplitMode) {
    if (mode === 'equal') {
      const each = totalAmount / newSlices.length;
      return newSlices.map(s => ({ ...s, amount: Math.round(each) }));
    }
    if (mode === 'retainer') {
      const total = newSlices.reduce((s, sl) => {
        const c = clients.find(c => c.id === sl.client_id);
        return s + (c?.retainer_amount || 1);
      }, 0);
      return newSlices.map(sl => {
        const c = clients.find(c => c.id === sl.client_id);
        const ratio = (c?.retainer_amount || 1) / total;
        return { ...sl, amount: Math.round(totalAmount * ratio) };
      });
    }
    return newSlices; // manual — don't touch amounts
  }

  function addClientSlice(clientId: string) {
    if (slices.some(s => s.client_id === clientId)) return;
    const newSlices = [...slices, {
      client_id: clientId,
      amount: 0,
      cost_label: direction === 'out' ? 'Shoot' : '',
      category_id: categories.find(c => ['Shoot Costs', 'Freelancer Fees'].includes(c.name))?.id || '',
    }];
    setSlices(rebalance(newSlices, splitMode));
  }

  function removeSlice(idx: number) {
    const newSlices = slices.filter((_, i) => i !== idx);
    setSlices(rebalance(newSlices, splitMode));
  }

  function updateSlice(idx: number, key: keyof ClientSlice, value: string | number) {
    setSlices(prev => prev.map((s, i) => i === idx ? { ...s, [key]: value } : s));
  }

  function applySplitMode(m: SplitMode) {
    setSplitMode(m);
    setSlices(prev => rebalance(prev, m));
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  function confirm() {
    if (!isBalanced && splitMode === 'manual') {
      // Auto-adjust last slice to make it balance
      const fixed = slices.slice(0, -1).reduce((s, sl) => s + sl.amount, 0);
      const last = { ...slices[slices.length - 1], amount: totalAmount - fixed };
      const adjusted = [...slices.slice(0, -1), last];
      onAccept(adjusted);
      return;
    }
    onAccept(slices);
  }

  const usedClientIds = new Set(slices.map(s => s.client_id));
  const availableClients = clients.filter(c => !usedClientIds.has(c.id));

  return (
    <div className="fixed bottom-4 right-4 z-[90] w-[380px] max-w-[calc(100vw-24px)] bg-white border-2 border-[#16C4BA] shadow-2xl">
      {/* Header */}
      <div className="bg-[#16C4BA] px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-[#070707]" />
          <span className="text-xs font-bold text-[#070707] uppercase tracking-wide">
            {direction === 'in' ? 'Client Payment Detected' : 'Shared Expense Detected'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setExpanded(!expanded)} className="text-[#070707]/60 hover:text-[#070707]">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button onClick={onDismiss} className="text-[#070707]/60 hover:text-[#070707]">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Collapsed state */}
      {!expanded && (
        <div className="px-4 py-2.5 flex items-center justify-between cursor-pointer" onClick={() => setExpanded(true)}>
          <span className="text-sm font-medium text-[#070707]">{suggestion.client_name} · {formatCurrency(totalAmount)}</span>
          <span className="text-xs text-[#16C4BA]">tap to review</span>
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 py-3 space-y-3">
          {/* Detection context */}
          <div>
            <p className="text-sm font-semibold text-[#070707]">{formatCurrency(totalAmount)}</p>
            <p className="text-xs text-[#888] mt-0.5">{suggestion.match_reason}</p>
          </div>

          {/* For month + mode (only for Cash In / payments) */}
          {direction === 'in' && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-[#888] uppercase tracking-wide block mb-1">For month</label>
                <select value={forMonth} onChange={e => setForMonth(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
                  {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-[#888] uppercase tracking-wide block mb-1">Mode</label>
                <select value={mode} onChange={e => setMode(e.target.value as typeof mode)}
                  className="w-full px-2 py-1.5 text-xs border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
            </div>
          )}

          {/* Split mode selector */}
          {slices.length >= 1 && (
            <div>
              <label className="text-[10px] text-[#888] uppercase tracking-wide block mb-1.5">Split method</label>
              <div className="flex gap-1">
                {([
                  { id: 'manual', label: 'Manual' },
                  { id: 'equal', label: 'Equal' },
                  { id: 'retainer', label: 'By retainer' },
                ] as { id: SplitMode; label: string }[]).map(opt => (
                  <button key={opt.id} onClick={() => applySplitMode(opt.id)}
                    className={`flex-1 py-1 text-[10px] font-medium border transition-colors ${
                      splitMode === opt.id
                        ? 'bg-[#070707] text-white border-[#070707]'
                        : 'border-[#ddd] text-[#555] hover:border-[#070707]'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {splitMode === 'equal' && <p className="text-[10px] text-[#aaa] mt-1">Split ₹{totalAmount.toLocaleString('en-IN')} equally across {slices.length} client{slices.length > 1 ? 's' : ''}</p>}
              {splitMode === 'retainer' && <p className="text-[10px] text-[#aaa] mt-1">Proportional to each client's retainer amount</p>}
              {splitMode === 'manual' && <p className="text-[10px] text-[#aaa] mt-1">Enter exact amounts — total must equal {formatCurrency(totalAmount)}</p>}
            </div>
          )}

          {/* Slices */}
          <div className="space-y-2">
            {slices.map((slice, idx) => {
              const client = clients.find(c => c.id === slice.client_id);
              return (
                <div key={idx} className="border border-[#e8e8e8] p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-5 h-5 bg-[#EFE9D9] flex items-center justify-center flex-shrink-0">
                        <span className="text-[9px] font-bold text-[#555]">{client?.name.slice(0, 2).toUpperCase()}</span>
                      </div>
                      <span className="text-xs font-medium text-[#070707] truncate">{client?.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] text-[#888]">₹</span>
                      <input
                        type="number"
                        value={slice.amount || ''}
                        onChange={e => updateSlice(idx, 'amount', Number(e.target.value))}
                        disabled={splitMode !== 'manual'}
                        className="w-20 px-2 py-1 text-xs text-right border border-[#ddd] focus:outline-none focus:border-[#16C4BA] disabled:bg-[#f5f5f5] disabled:text-[#555] tabular-nums"
                      />
                      {slices.length > 1 && (
                        <button onClick={() => removeSlice(idx)} className="text-[#ccc] hover:text-[#DC2626]">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Cost line (for expenses) or just label */}
                  {direction === 'out' && (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <input
                          value={slice.cost_label}
                          onChange={e => updateSlice(idx, 'cost_label', e.target.value)}
                          placeholder="Cost line (e.g. Shoot, Edit)"
                          className="w-full px-2 py-1 text-[11px] border border-[#ddd] focus:outline-none focus:border-[#16C4BA]"
                        />
                      </div>
                      <select
                        value={slice.category_id}
                        onChange={e => updateSlice(idx, 'category_id', e.target.value)}
                        className="flex-1 px-2 py-1 text-[11px] border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
                        <option value="">Category</option>
                        {categories.filter(c => c.type === 'expense' || c.type === 'both').map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add another client */}
          {availableClients.length > 0 && (
            <div>
              <select value="" onChange={e => e.target.value && addClientSlice(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-dashed border-[#16C4BA] text-[#16C4BA] focus:outline-none bg-[#f0fdfa]">
                <option value="">+ Add another client to this split...</option>
                {availableClients.map(c => (
                  <option key={c.id} value={c.id}>{c.name} (retainer: {formatCurrency(c.retainer_amount, true)})</option>
                ))}
              </select>
            </div>
          )}

          {/* Balance indicator */}
          {slices.length > 1 && (
            <div className={`flex items-center justify-between text-xs px-2 py-1.5 ${
              isBalanced ? 'bg-[#dcfce7] text-[#16A34A]' : 'bg-[#fee2e2] text-[#DC2626]'
            }`}>
              <span className="flex items-center gap-1.5">
                {!isBalanced && <AlertCircle className="w-3.5 h-3.5" />}
                {isBalanced ? '✓ Amounts balance' : `${remaining > 0 ? '+' : ''}${formatCurrency(remaining)} unallocated`}
              </span>
              <span className="font-medium tabular-nums">
                {formatCurrency(allocated)} / {formatCurrency(totalAmount)}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={confirm}
              className="flex-1 py-2 text-xs font-semibold bg-[#16C4BA] text-[#070707] hover:bg-[#13b0a7] transition-colors flex items-center justify-center gap-1.5"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {direction === 'in'
                ? `Record payment${slices.length > 1 ? ` (${slices.length} clients)` : ''}`
                : `Allocate to ${slices.length} client${slices.length > 1 ? 's' : ''}`
              }
            </button>
            <button onClick={onDismiss} className="px-3 py-2 text-xs text-[#888] hover:text-[#555] border border-[#e8e8e8]">
              Not this
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
