import React, { useState, useRef } from 'react';
import { Camera, Upload, AlertTriangle, Check, Trash2, Edit2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { getCategories, getClients, addCashTransaction, addAuditEntry } from '@/lib/storage';
import { autoLinkToCosting } from '@/lib/auto-cost-link';
import { formatCurrency, formatDate } from '@/utils/format';
import type { CashType } from '@/types';

interface ExtractedRow {
  date: string;
  type: CashType;
  amount: number;
  party: string;
  description: string;
  reason: string;
  category_id: string;
  client_id?: string;
  confidence: 'high' | 'medium' | 'low';
  raw_text: string;
  _editing?: boolean;
}

interface NotebookImportProps {
  onDone: () => void;
}

export function NotebookImport({ onDone }: NotebookImportProps) {
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload');
  const [uploading, setUploading] = useState(false);
  const [rows, setRows] = useState<ExtractedRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const categories = getCategories();
  const clients = getClients().filter(c => c.status === 'active');

  async function handleImage(file: File) {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);

    // Show preview
    const reader = new FileReader();
    reader.onload = e => setPreviewSrc(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => resolve((e.target?.result as string).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });

      const response = await fetch('/api/read-notebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mediaType: file.type,
          categories: categories.map(c => ({ id: c.id, name: c.name })),
          clients: clients.map(c => ({ id: c.id, name: c.name })),
        }),
      });

      if (!response.ok) throw new Error('Failed to read notebook');
      const { transactions } = await response.json();
      setRows(transactions);
      setStep('review');
    } catch (err) {
      console.error(err);
      alert('Could not read the image. Try a clearer photo with good lighting.');
    } finally {
      setUploading(false);
    }
  }

  function updateRow(idx: number, updates: Partial<ExtractedRow>) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...updates } : r));
  }

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx));
  }

  async function saveAll() {
    setSaving(true);
    let saved = 0;
    for (const row of rows) {
      try {
        const txn = addCashTransaction({
          date: row.date,
          type: row.type,
          amount: row.amount,
          category_id: row.category_id,
          party: row.party,
          description: row.description,
          reason: row.reason,
          client_id: row.client_id || undefined,
          tags: ['notebook-import'],
          created_by: 'founder',
        });
        autoLinkToCosting(txn, 'cash');
        addAuditEntry({ user_id: 'founder', action: 'NOTEBOOK_IMPORT_TXN', entity: 'cash_transaction', entity_id: txn.id });
        saved++;
      } catch (err) {
        console.error('Failed to save row:', err);
      }
    }
    setSaving(false);
    setStep('done');
    setTimeout(() => onDone(), 1500);
  }

  const confidenceColor = {
    high: 'text-[#16A34A]',
    medium: 'text-[#F59E0B]',
    low: 'text-[#DC2626]',
  };

  if (step === 'done') {
    return (
      <div className="text-center py-8">
        <div className="w-12 h-12 bg-[#dcfce7] flex items-center justify-center mx-auto mb-3">
          <Check className="w-6 h-6 text-[#16A34A]" />
        </div>
        <p className="text-sm font-medium text-[#070707]">{rows.length} transactions saved</p>
        <p className="text-xs text-[#888] mt-1">Closing...</p>
      </div>
    );
  }

  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[#555]">
          Take a photo of your notebook or handwritten cash notes. Claude will read it and extract all transactions for you to review.
        </p>

        {/* Drag/drop zone */}
        <div
          className="border-2 border-dashed border-[#ddd] p-8 text-center hover:border-[#16C4BA] transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImage(f); }}
          onDragOver={e => e.preventDefault()}
        >
          {uploading ? (
            <div className="space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-[#16C4BA] mx-auto" />
              <p className="text-sm text-[#888]">Reading your notebook...</p>
            </div>
          ) : (
            <>
              <Camera className="w-8 h-8 text-[#ccc] mx-auto mb-3" />
              <p className="text-sm text-[#555] mb-1">Tap to choose photo or drag here</p>
              <p className="text-xs text-[#aaa]">Works with phone photos, scans, or screenshots</p>
            </>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleImage(f); }} />

        <div className="bg-[#f7f7f5] px-3 py-2 text-xs text-[#888] space-y-1">
          <p className="font-medium text-[#555]">Tips for best results:</p>
          <p>• Good lighting, no shadows across the text</p>
          <p>• Hold phone flat over the notebook, not at an angle</p>
          <p>• Make sure dates and amounts are clearly visible</p>
        </div>
      </div>
    );
  }

  // Review step
  const totalIn = rows.filter(r => r.type === 'Cash In').reduce((s, r) => s + r.amount, 0);
  const totalOut = rows.filter(r => r.type === 'Cash Out').reduce((s, r) => s + r.amount, 0);
  const lowConfCount = rows.filter(r => r.confidence === 'low').length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 px-3 py-2 bg-[#f7f7f5] text-sm">
        <span><strong>{rows.length}</strong> transactions extracted</span>
        {totalIn > 0 && <span className="text-[#16A34A]">+{formatCurrency(totalIn, true)}</span>}
        {totalOut > 0 && <span className="text-[#DC2626]">-{formatCurrency(totalOut, true)}</span>}
        {lowConfCount > 0 && (
          <span className="flex items-center gap-1 text-[#DC2626]">
            <AlertTriangle className="w-3.5 h-3.5" />{lowConfCount} uncertain
          </span>
        )}
      </div>

      {lowConfCount > 0 && (
        <div className="flex items-start gap-2 bg-[#fef3c7] border border-[#F59E0B] px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-[#d97706] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#92400e]">
            {lowConfCount} row{lowConfCount > 1 ? 's were' : ' was'} hard to read. Review the highlighted ones — tap to expand and edit.
          </p>
        </div>
      )}

      {/* Notebook preview thumbnail */}
      {previewSrc && (
        <img src={previewSrc} alt="Notebook" className="w-full max-h-48 object-contain border border-[#e8e8e8]" />
      )}

      {/* Rows */}
      <div className="space-y-1 max-h-[50vh] overflow-y-auto">
        {rows.map((row, idx) => {
          const isExpanded = expandedRow === idx;
          const cat = categories.find(c => c.id === row.category_id);
          const client = clients.find(c => c.id === row.client_id);
          return (
            <div key={idx} className={`border ${row.confidence === 'low' ? 'border-[#fca5a5] bg-[#fff5f5]' : 'border-[#e8e8e8]'}`}>
              {/* Row summary */}
              <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={() => setExpandedRow(isExpanded ? null : idx)}>
                <span className={`w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0 ${row.type === 'Cash In' ? 'bg-[#dcfce7] text-[#16A34A]' : 'bg-[#fee2e2] text-[#DC2626]'}`}>
                  {row.type === 'Cash In' ? '+' : '-'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium tabular-nums">{formatCurrency(row.amount)}</span>
                    <span className="text-xs text-[#888] truncate">{row.party}</span>
                    <span className="text-xs text-[#aaa] hidden sm:block">{row.date}</span>
                    <span className={`text-[10px] font-medium ${confidenceColor[row.confidence]}`}>{row.confidence}</span>
                  </div>
                  <p className="text-xs text-[#888] truncate">{row.description}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={e => { e.stopPropagation(); removeRow(idx); }} className="text-[#ccc] hover:text-[#DC2626]">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[#888]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#888]" />}
                </div>
              </div>

              {/* Expanded edit form */}
              {isExpanded && (
                <div className="border-t border-[#f0f0f0] px-3 py-3 space-y-3 bg-white">
                  {row.raw_text && (
                    <p className="text-xs text-[#aaa] italic">Read: "{row.raw_text}"</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-[#888] block mb-1">Date</label>
                      <input type="date" value={row.date} onChange={e => updateRow(idx, { date: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                    </div>
                    <div>
                      <label className="text-xs text-[#888] block mb-1">Type</label>
                      <select value={row.type} onChange={e => updateRow(idx, { type: e.target.value as CashType })}
                        className="w-full px-2 py-1.5 text-xs border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
                        <option value="Cash In">Cash In</option>
                        <option value="Cash Out">Cash Out</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-[#888] block mb-1">Amount (₹)</label>
                      <input type="number" value={row.amount} onChange={e => updateRow(idx, { amount: Number(e.target.value) })}
                        className="w-full px-2 py-1.5 text-xs border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                    </div>
                    <div>
                      <label className="text-xs text-[#888] block mb-1">Category</label>
                      <select value={row.category_id} onChange={e => updateRow(idx, { category_id: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[#888] block mb-1">Party</label>
                    <input value={row.party} onChange={e => updateRow(idx, { party: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                  </div>
                  <div>
                    <label className="text-xs text-[#888] block mb-1">Description</label>
                    <input value={row.description} onChange={e => updateRow(idx, { description: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                  </div>
                  <div>
                    <label className="text-xs text-[#888] block mb-1">Reason / Purpose</label>
                    <input value={row.reason} onChange={e => updateRow(idx, { reason: e.target.value })}
                      placeholder="Which client, project, purpose..."
                      className="w-full px-2 py-1.5 text-xs border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                  </div>
                  <div>
                    <label className="text-xs text-[#888] block mb-1">Link to client</label>
                    <select value={row.client_id || ''} onChange={e => updateRow(idx, { client_id: e.target.value || undefined })}
                      className="w-full px-2 py-1.5 text-xs border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
                      <option value="">Not client-specific</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Save all */}
      <div className="flex items-center justify-between pt-2 border-t border-[#e8e8e8]">
        <button onClick={() => { setStep('upload'); setRows([]); setPreviewSrc(null); }}
          className="text-sm text-[#888] hover:text-[#555]">
          ← Retake photo
        </button>
        <button
          onClick={saveAll}
          disabled={rows.length === 0 || saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#16C4BA] text-[#070707] disabled:opacity-40 hover:bg-[#13b0a7]"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save {rows.length} transactions
        </button>
      </div>
    </div>
  );
}
