import React, { useState } from 'react';
import { Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { getClients, getCategories, upsertClientMonthlyCost, getClientMonthlyCosts } from '@/lib/storage';
import { addPaymentRecord } from '@/lib/payments';
import { formatCurrency, formatMonth, monthsAgo } from '@/utils/format';

export interface ClientSlice {
  client_id: string;
  amount: number;
  cost_label: string;
  category_id: string;
}

type SplitMode = 'manual' | 'equal' | 'retainer';

interface ClientSplitAllocatorProps {
  totalAmount: number;
  forMonth: string;
  direction: 'in' | 'out';     // in = payment received, out = expense to split
  transactionId?: string;
  initialClientId?: string;
  onSave?: (slices: ClientSlice[], month: string, mode: 'UPI' | 'Bank Transfer' | 'Cash' | 'Cheque') => void;
  showSaveButton?: boolean;
}

export function ClientSplitAllocator({
  totalAmount, forMonth, direction, transactionId, initialClientId, onSave, showSaveButton = true,
}: ClientSplitAllocatorProps) {
  const clients = getClients().filter(c => c.status === 'active');
  const categories = getCategories();

  const [splitMode, setSplitMode] = useState<SplitMode>('manual');
  const [slices, setSlices] = useState<ClientSlice[]>(() => {
    if (initialClientId) {
      return [{
        client_id: initialClientId, amount: totalAmount,
        cost_label: '', category_id: categories.find(c => ['Shoot Costs', 'Freelancer Fees'].includes(c.name))?.id || '',
      }];
    }
    return [];
  });
  const [mode, setMode] = useState<'UPI' | 'Bank Transfer' | 'Cash' | 'Cheque'>('Bank Transfer');
  const [selectedMonth, setSelectedMonth] = useState(forMonth);
  const [saved, setSaved] = useState(false);

  const allocated = slices.reduce((s, sl) => s + sl.amount, 0);
  const remaining = totalAmount - allocated;
  const isBalanced = Math.abs(remaining) < 1;

  function rebalance(newSlices: ClientSlice[], m: SplitMode): ClientSlice[] {
    if (m === 'equal' && newSlices.length > 0) {
      const base = Math.floor(totalAmount / newSlices.length);
      const remainder = totalAmount - base * newSlices.length;
      return newSlices.map((s, i) => ({ ...s, amount: base + (i === 0 ? Math.round(remainder) : 0) }));
    }
    if (m === 'retainer' && newSlices.length > 0) {
      const totalRetainer = newSlices.reduce((s, sl) => {
        const c = clients.find(c => c.id === sl.client_id);
        return s + (c?.retainer_amount || 1);
      }, 0);
      let running = 0;
      return newSlices.map((sl, i) => {
        const c = clients.find(c => c.id === sl.client_id);
        const ratio = (c?.retainer_amount || 1) / totalRetainer;
        const amt = i === newSlices.length - 1
          ? totalAmount - running
          : Math.round(totalAmount * ratio);
        running += amt;
        return { ...sl, amount: amt };
      });
    }
    return newSlices;
  }

  function addClient(clientId: string) {
    if (slices.some(s => s.client_id === clientId)) return;
    const newSlices = [...slices, {
      client_id: clientId, amount: 0,
      cost_label: direction === 'out' ? '' : '',
      category_id: categories.find(c => ['Shoot Costs', 'Freelancer Fees'].includes(c.name))?.id || '',
    }];
    setSlices(rebalance(newSlices, splitMode));
  }

  function removeClient(idx: number) {
    const newSlices = slices.filter((_, i) => i !== idx);
    setSlices(rebalance(newSlices, splitMode));
  }

  function updateSlice(idx: number, key: keyof ClientSlice, value: string | number) {
    setSlices(prev => prev.map((s, i) => i === idx ? { ...s, [key]: value } : s));
  }

  function changeSplitMode(m: SplitMode) {
    setSplitMode(m);
    setSlices(prev => rebalance(prev, m));
  }

  function handleSave() {
    if (slices.length === 0) return;

    // Fix rounding on last slice
    const finalSlices = [...slices];
    if (!isBalanced && finalSlices.length > 0) {
      const othersTotal = finalSlices.slice(0, -1).reduce((s, sl) => s + sl.amount, 0);
      finalSlices[finalSlices.length - 1] = { ...finalSlices[finalSlices.length - 1], amount: totalAmount - othersTotal };
    }

    if (direction === 'in') {
      finalSlices.forEach(slice => {
        addPaymentRecord({
          client_id: slice.client_id,
          date: new Date().toISOString().split('T')[0],
          amount: slice.amount,
          mode,
          for_month: selectedMonth,
          notes: finalSlices.length > 1
            ? `Split: ${finalSlices.length} clients, total ${formatCurrency(totalAmount)}`
            : 'Linked from transaction',
        });
      });
    } else {
      finalSlices.forEach(slice => {
        const all = getClientMonthlyCosts();
        const existing = all.find(c => c.client_id === slice.client_id && c.month === selectedMonth);
        const newLine = {
          id: transactionId || crypto.randomUUID(),
          label: slice.cost_label || 'Shared expense',
          planned_amount: slice.amount,
          actual_amount: slice.amount,
          category_id: slice.category_id,
          transaction_ids: transactionId ? [transactionId] : [],
        };
        if (existing) {
          const alreadyLinked = transactionId && existing.line_items.some((l: { transaction_ids: string[] }) => l.transaction_ids.includes(transactionId));
          if (!alreadyLinked) {
            const updatedLines = [...existing.line_items, newLine];
            upsertClientMonthlyCost({ ...existing, line_items: updatedLines, total_cost: updatedLines.reduce((s: number, l: { actual_amount: number }) => s + l.actual_amount, 0) });
          }
        } else {
          upsertClientMonthlyCost({ client_id: slice.client_id, month: forMonth, line_items: [newLine], total_cost: slice.amount });
        }
      });
    }

    setSaved(true);
    onSave?.(finalSlices, selectedMonth, mode);
  }

  const usedIds = new Set(slices.map(s => s.client_id));
  const available = clients.filter(c => !usedIds.has(c.id));

  if (saved) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-[#16A34A]">
        <CheckCircle className="w-4 h-4" />
        <span>Saved: {slices.length} client{slices.length > 1 ? 's' : ''}, {formatCurrency(totalAmount)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[#555] uppercase tracking-wide">
          {direction === 'in' ? 'Record as client payment' : 'Split expense across clients'}
        </p>
        <span className="text-xs text-[#888]">{formatCurrency(totalAmount)} total</span>
      </div>

      {/* Client picker */}
      <select value="" onChange={e => e.target.value && addClient(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-dashed border-[#16C4BA] text-[#16C4BA] focus:outline-none bg-[#f0fdfa]">
        <option value="">+ Add client...</option>
        {available.map(c => (
          <option key={c.id} value={c.id}>{c.name} ({formatCurrency(c.retainer_amount, true)}/mo)</option>
        ))}
      </select>

      {slices.length > 0 && (
        <>
          {/* Split mode */}
          <div className="flex gap-1">
            {([
              { id: 'manual' as SplitMode, label: 'Manual' },
              { id: 'equal' as SplitMode, label: 'Equal' },
              { id: 'retainer' as SplitMode, label: 'By retainer' },
            ]).map(opt => (
              <button key={opt.id} onClick={() => changeSplitMode(opt.id)}
                className={`flex-1 py-1 text-[10px] font-medium border transition-colors ${
                  splitMode === opt.id ? 'bg-[#070707] text-white border-[#070707]' : 'border-[#ddd] text-[#555] hover:border-[#070707]'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Payment mode and month */}
          {direction === 'in' && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 flex-1">
                <label className="text-xs text-[#888] flex-shrink-0">Mode:</label>
                <select value={mode} onChange={e => setMode(e.target.value as typeof mode)}
                  className="flex-1 px-2 py-1 text-xs border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
              <div className="flex items-center gap-1 flex-1">
                <label className="text-xs text-[#888] flex-shrink-0">For:</label>
                <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                  className="flex-1 px-2 py-1 text-xs border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
              </div>
            </div>
          )}

          {/* Slices */}
          <div className="space-y-1.5">
            {slices.map((slice, idx) => {
              const client = clients.find(c => c.id === slice.client_id);
              return (
                <div key={idx} className="border border-[#e8e8e8] px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[#070707] truncate flex-1">{client?.name}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] text-[#888]">₹</span>
                      <input type="number" value={slice.amount || ''}
                        onChange={e => updateSlice(idx, 'amount', Number(e.target.value))}
                        disabled={splitMode !== 'manual'}
                        className="w-20 px-2 py-1 text-xs text-right border border-[#ddd] focus:outline-none focus:border-[#16C4BA] disabled:bg-[#f5f5f5] tabular-nums" />
                      <button onClick={() => removeClient(idx)} className="text-[#ccc] hover:text-[#DC2626]">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {direction === 'out' && (
                    <div className="flex gap-2">
                      <input value={slice.cost_label} onChange={e => updateSlice(idx, 'cost_label', e.target.value)}
                        placeholder="Cost line label (e.g. Shoot, Edit)"
                        className="flex-1 px-2 py-1 text-[11px] border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                      <select value={slice.category_id} onChange={e => updateSlice(idx, 'category_id', e.target.value)}
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

          {/* Balance indicator */}
          {slices.length > 0 && (
            <div className={`flex items-center justify-between text-xs px-2 py-1.5 ${
              isBalanced ? 'bg-[#dcfce7] text-[#16A34A]' : 'bg-[#fee2e2] text-[#DC2626]'
            }`}>
              <span className="flex items-center gap-1">
                {isBalanced ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {isBalanced ? 'Balanced' : `${formatCurrency(Math.abs(remaining))} ${remaining > 0 ? 'unallocated' : 'over-allocated'}`}
              </span>
              <span className="tabular-nums">{formatCurrency(allocated)} / {formatCurrency(totalAmount)}</span>
            </div>
          )}

          {/* Save button */}
          {showSaveButton && (
            <button onClick={handleSave}
              className="w-full py-2 text-xs font-semibold bg-[#16C4BA] text-[#070707] hover:bg-[#13b0a7] flex items-center justify-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              {direction === 'in'
                ? `Record payment${slices.length > 1 ? ` → ${slices.length} clients` : ''}`
                : `Allocate to ${slices.length} cost sheet${slices.length > 1 ? 's' : ''}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
