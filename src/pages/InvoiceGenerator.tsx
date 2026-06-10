import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Download, Settings, Save, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { getInvoiceSettings, setInvoiceSettings, getClients, addInvoice, getInvoices, updateInvoice, addAuditEntry } from '@/lib/storage';
import { formatCurrency, formatDate } from '@/utils/format';
import type { InvoiceSettings, Invoice } from '@/types';

interface LineItem { id: string; description: string; quantity: number; rate: number; amount: number; }

const EMPTY_SETTINGS: InvoiceSettings = {
  company_name: 'Respawn Media', address: '', city: 'Chennai', state: 'Tamil Nadu',
  pincode: '600001', gstin: '', pan: '', phone: '', email: '',
  bank_name: '', account_no: '', ifsc: '', account_holder: '',
  footer_note: 'Thank you for your business!',
  payment_terms: 'Payment due within 15 days of invoice date.',
};

function nextInvoiceNo(invoices: Invoice[]): string {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const existing = invoices
    .map(i => parseInt(i.invoice_no.split('-').pop() || '0'))
    .filter(n => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `RM-${year}${month}-${String(next).padStart(3, '0')}`;
}

function toWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (n === 0) return 'Zero';
  function convert(num: number): string {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + convert(num % 100) : '');
    if (num < 100000) return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
    if (num < 10000000) return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + convert(num % 100000) : '');
    return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + convert(num % 10000000) : '');
  }
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  let result = convert(rupees) + ' Rupees';
  if (paise > 0) result += ' and ' + convert(paise) + ' Paise';
  return result + ' Only';
}

export function InvoiceGeneratorPage() {
  const toast = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [settingsModal, setSettingsModal] = useState(false);
  const [settings, setSettings] = useState<InvoiceSettings>(getInvoiceSettings() || EMPTY_SETTINGS);
  const [settingsForm, setSettingsForm] = useState<InvoiceSettings>(getInvoiceSettings() || EMPTY_SETTINGS);
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [selectedSavedInvoice, setSelectedSavedInvoice] = useState<string>('');

  const clients = getClients();
  const allInvoices = getInvoices();
  const clientOptions = [{ value: '', label: 'Select client (optional)' }, ...clients.map(c => ({ value: c.id, label: c.name }))];

  const [form, setForm] = useState({
    invoice_no: nextInvoiceNo(allInvoices),
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    client_id: '',
    client_name: '',
    client_address: '',
    client_gstin: '',
    gst_rate: 18,
    notes: '',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: crypto.randomUUID(), description: 'Social Media Management', quantity: 1, rate: 0, amount: 0 },
  ]);

  const subtotal = lineItems.reduce((s, l) => s + l.amount, 0);
  const gstAmount = subtotal * (form.gst_rate / 100);
  const total = subtotal + gstAmount;

  function updateLineItem(id: string, field: keyof LineItem, value: string | number) {
    setLineItems(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === 'quantity' || field === 'rate') updated.amount = Number(updated.quantity) * Number(updated.rate);
      return updated;
    }));
  }

  function handleClientSelect(clientId: string) {
    const client = clients.find(c => c.id === clientId);
    setForm(f => ({ ...f, client_id: clientId, client_name: client?.name || '', client_gstin: client?.gstin || '' }));
  }

  function loadSavedInvoice(invoiceId: string) {
    const inv = allInvoices.find(i => i.id === invoiceId);
    if (!inv) return;
    // We can't restore line items since they're not stored yet — just populate header
    const client = clients.find(c => c.id === inv.client_id);
    setForm(f => ({
      ...f,
      invoice_no: inv.invoice_no,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      client_id: inv.client_id,
      client_name: client?.name || '',
      client_gstin: client?.gstin || '',
      notes: inv.notes || '',
      gst_rate: inv.amount > 0 ? Math.round((inv.gst_amount / inv.amount) * 100) : 18,
    }));
    setSavedInvoiceId(inv.id);
    toast('Invoice loaded', 'info');
  }

  function saveInvoice() {
    if (!form.client_id && !form.client_name) {
      toast('Please select or enter a client name', 'error');
      return;
    }
    if (subtotal === 0) {
      toast('Please add at least one line item with an amount', 'error');
      return;
    }
    const payload: Omit<Invoice, 'id'> = {
      client_id: form.client_id,
      invoice_no: form.invoice_no,
      invoice_date: form.invoice_date,
      due_date: form.due_date || form.invoice_date,
      amount: subtotal,
      gst_amount: gstAmount,
      total,
      status: 'Draft',
      notes: form.notes,
    };
    if (savedInvoiceId) {
      updateInvoice(savedInvoiceId, payload);
      addAuditEntry({ user_id: 'founder', action: 'UPDATE_INVOICE', entity: 'invoice', entity_id: savedInvoiceId });
      toast('Invoice updated', 'success');
    } else {
      const inv = addInvoice(payload);
      setSavedInvoiceId(inv.id);
      addAuditEntry({ user_id: 'founder', action: 'CREATE_INVOICE', entity: 'invoice', entity_id: inv.id });
      toast('Invoice saved', 'success');
    }
  }

  // Reset for new invoice
  function newInvoice() {
    setForm({
      invoice_no: nextInvoiceNo(getInvoices()),
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: '', client_id: '', client_name: '',
      client_address: '', client_gstin: '', gst_rate: 18, notes: '',
    });
    setLineItems([{ id: crypto.randomUUID(), description: 'Social Media Management', quantity: 1, rate: 0, amount: 0 }]);
    setSavedInvoiceId(null);
  }

  async function downloadPDF() {
    if (!printRef.current) return;
    setPdfGenerating(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff',
        width: printRef.current.offsetWidth,
        height: printRef.current.offsetHeight,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${form.invoice_no}.pdf`);
      toast('PDF downloaded', 'success');
      // Auto-save after PDF
      if (!savedInvoiceId) saveInvoice();
    } catch (err) {
      toast('PDF generation failed', 'error');
      console.error(err);
    } finally { setPdfGenerating(false); }
  }

  function saveSettings() {
    setInvoiceSettings(settingsForm);
    setSettings(settingsForm);
    toast('Invoice settings saved', 'success');
    setSettingsModal(false);
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1100px]">
      <style>{`@media print { .no-print { display: none !important; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }`}</style>

      <div className="no-print">
        <PageHeader
          title="Invoice Generator"
          subtitle={savedInvoiceId ? `Editing ${form.invoice_no}` : 'New invoice'}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setSettingsForm(settings); setSettingsModal(true); }} icon={<Settings className="w-3.5 h-3.5" />}>Settings</Button>
              <Button variant="secondary" size="sm" onClick={newInvoice}>New</Button>
              <Button variant="secondary" size="sm" icon={<Save className="w-3.5 h-3.5" />} onClick={saveInvoice}>Save</Button>
              <Button variant="primary" icon={<Download className="w-4 h-4" />} onClick={downloadPDF} loading={pdfGenerating}>Download PDF</Button>
            </div>
          }
        />

        {/* Load past invoices */}
        {allInvoices.length > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <FileText className="w-4 h-4 text-[#888]" />
            <span className="text-xs text-[#888]">Load saved:</span>
            <select value={selectedSavedInvoice}
              onChange={e => { setSelectedSavedInvoice(e.target.value); if (e.target.value) loadSavedInvoice(e.target.value); }}
              className="px-3 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
              <option value="">Select an invoice...</option>
              {allInvoices.slice(0, 20).map(inv => {
                const client = clients.find(c => c.id === inv.client_id);
                return <option key={inv.id} value={inv.id}>{inv.invoice_no} — {client?.name || 'Unknown'} — {inv.status}</option>;
              })}
            </select>
            {savedInvoiceId && <Badge variant="green">Saved</Badge>}
          </div>
        )}

        {!settings.company_name && (
          <div className="mb-4 bg-[#fef3c7] border border-[#F59E0B] px-4 py-3 text-sm text-[#92400e]">
            Set up your company info first — click "Settings" above.
          </div>
        )}

        {/* Invoice fields */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 no-print">
          <Card>
            <h3 className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-3">Invoice Info</h3>
            <div className="space-y-3">
              <Input label="Invoice Number" value={form.invoice_no} onChange={e => setForm({ ...form, invoice_no: e.target.value })} />
              <Input label="Invoice Date" type="date" value={form.invoice_date} onChange={e => setForm({ ...form, invoice_date: e.target.value })} />
              <Input label="Due Date" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
              <Input label="GST Rate (%)" type="number" value={form.gst_rate.toString()} onChange={e => setForm({ ...form, gst_rate: Number(e.target.value) })} />
            </div>
          </Card>
          <Card>
            <h3 className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-3">Bill To</h3>
            <div className="space-y-3">
              <Select label="Select Client" value={form.client_id} onChange={e => handleClientSelect(e.target.value)} options={clientOptions} />
              <Input label="Client Name" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} />
              <Textarea label="Client Address" value={form.client_address} onChange={e => setForm({ ...form, client_address: e.target.value })} rows={2} />
              <Input label="Client GSTIN" value={form.client_gstin} onChange={e => setForm({ ...form, client_gstin: e.target.value })} />
            </div>
          </Card>
          <Card>
            <h3 className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-3">Notes</h3>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={5} placeholder="Notes or payment terms for this invoice..." />
          </Card>
        </div>

        {/* Line items */}
        <Card className="mb-4 no-print">
          <h3 className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-3">Line Items</h3>
          <div className="space-y-2 mb-3">
            <div className="grid grid-cols-12 gap-2 text-xs text-[#888] uppercase tracking-wide pb-1 border-b border-[#f0f0f0]">
              <span className="col-span-5">Description</span><span className="col-span-2 text-right">Qty</span>
              <span className="col-span-2 text-right">Rate (₹)</span><span className="col-span-2 text-right">Amount</span><span className="col-span-1" />
            </div>
            {lineItems.map(line => (
              <div key={line.id} className="grid grid-cols-12 gap-2 items-center">
                <input value={line.description} onChange={e => updateLineItem(line.id, 'description', e.target.value)}
                  className="col-span-5 px-2 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                <input type="number" value={line.quantity} onChange={e => updateLineItem(line.id, 'quantity', Number(e.target.value))}
                  className="col-span-2 px-2 py-1.5 text-sm text-right border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                <input type="number" value={line.rate || ''} onChange={e => updateLineItem(line.id, 'rate', Number(e.target.value))}
                  className="col-span-2 px-2 py-1.5 text-sm text-right border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" placeholder="0" />
                <span className="col-span-2 text-right text-sm font-medium tabular-nums">{formatCurrency(line.amount)}</span>
                <button onClick={() => lineItems.length > 1 && setLineItems(l => l.filter(x => x.id !== line.id))}
                  className="col-span-1 text-[#ccc] hover:text-[#DC2626] flex justify-end"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="secondary" icon={<Plus className="w-3 h-3" />}
            onClick={() => setLineItems(l => [...l, { id: crypto.randomUUID(), description: '', quantity: 1, rate: 0, amount: 0 }])}>
            Add Line
          </Button>
          <div className="mt-4 border-t border-[#f0f0f0] pt-3 space-y-1.5 text-sm max-w-xs ml-auto">
            <div className="flex justify-between"><span className="text-[#888]">Subtotal</span><span className="tabular-nums">{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">GST @ {form.gst_rate}%</span><span className="tabular-nums">{formatCurrency(gstAmount)}</span></div>
            <div className="flex justify-between font-bold text-base border-t border-[#e0e0e0] pt-2"><span>Total</span><span className="tabular-nums">{formatCurrency(total)}</span></div>
          </div>
        </Card>
      </div>

      {/* ── PRINT-READY INVOICE ── */}
      <div ref={printRef} className="bg-white border border-[#e8e8e8]" style={{ fontFamily: 'DM Sans, Arial, sans-serif' }}>
        {/* Header */}
        <div className="flex justify-between items-start p-8 border-b border-[#e8e8e8]">
          <div className="flex items-start gap-4">
            {settings.logo_base64 && <img src={settings.logo_base64} alt="Logo" className="w-20 h-20 object-contain flex-shrink-0" />}
            <div>
              <h1 style={{ fontFamily: 'Barlow Condensed, Arial Narrow, sans-serif', fontWeight: 900, fontSize: '28px', letterSpacing: '2px', textTransform: 'uppercase', color: '#070707', margin: 0 }}>
                {settings.company_name}
              </h1>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '6px', lineHeight: '1.6' }}>
                {settings.address && <div>{settings.address}</div>}
                <div>{[settings.city, settings.state, settings.pincode].filter(Boolean).join(', ')}</div>
                {settings.phone && <div>Ph: {settings.phone}</div>}
                {settings.email && <div>{settings.email}</div>}
                {settings.gstin && <div>GSTIN: {settings.gstin}</div>}
                {settings.pan && <div>PAN: {settings.pan}</div>}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div style={{ background: '#070707', color: '#fff', padding: '8px 24px', marginBottom: '12px', display: 'inline-block' }}>
              <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '2px', textTransform: 'uppercase' }}>Invoice</span>
            </div>
            <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.8' }}>
              <div><strong style={{ color: '#333' }}>Invoice No:</strong> {form.invoice_no}</div>
              <div><strong style={{ color: '#333' }}>Date:</strong> {formatDate(form.invoice_date)}</div>
              {form.due_date && <div><strong style={{ color: '#333' }}>Due:</strong> {formatDate(form.due_date)}</div>}
            </div>
          </div>
        </div>

        {/* Bill to */}
        <div style={{ padding: '20px 32px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Bill To</div>
          <div style={{ fontWeight: 600, color: '#070707', fontSize: '14px' }}>{form.client_name || 'Client Name'}</div>
          {form.client_address && <div style={{ fontSize: '12px', color: '#666', marginTop: '2px', whiteSpace: 'pre-line' }}>{form.client_address}</div>}
          {form.client_gstin && <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>GSTIN: {form.client_gstin}</div>}
        </div>

        {/* Line items table */}
        <div style={{ padding: '20px 32px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #070707' }}>
                <th style={{ textAlign: 'left', padding: '8px 0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#555', width: '32px' }}>#</th>
                <th style={{ textAlign: 'left', padding: '8px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#555' }}>Description</th>
                <th style={{ textAlign: 'right', padding: '8px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#555', width: '60px' }}>Qty</th>
                <th style={{ textAlign: 'right', padding: '8px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#555', width: '100px' }}>Rate</th>
                <th style={{ textAlign: 'right', padding: '8px 0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#555', width: '110px' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line, i) => (
                <tr key={line.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 0', color: '#888', fontSize: '12px' }}>{i + 1}</td>
                  <td style={{ padding: '10px 8px', color: '#333' }}>{line.description}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{line.quantity}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(line.rate)}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatCurrency(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <div style={{ width: '260px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', color: '#888' }}>
                <span>Subtotal</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', color: '#888' }}>
                <span>CGST @ {form.gst_rate / 2}%</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(gstAmount / 2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', color: '#888' }}>
                <span>SGST @ {form.gst_rate / 2}%</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(gstAmount / 2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '16px', fontWeight: 700, borderTop: '2px solid #070707', marginTop: '4px' }}>
                <span>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic', marginTop: '4px' }}>{toWords(Math.round(total))}</div>
        </div>

        {/* Bank + notes */}
        <div style={{ padding: '20px 32px', borderTop: '1px solid #f0f0f0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Payment Details</div>
            <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.8' }}>
              {settings.bank_name && <div><strong style={{ color: '#333' }}>Bank:</strong> {settings.bank_name}</div>}
              {settings.account_holder && <div><strong style={{ color: '#333' }}>Name:</strong> {settings.account_holder}</div>}
              {settings.account_no && <div><strong style={{ color: '#333' }}>Account:</strong> {settings.account_no}</div>}
              {settings.ifsc && <div><strong style={{ color: '#333' }}>IFSC:</strong> {settings.ifsc}</div>}
            </div>
          </div>
          {(form.notes || settings.payment_terms) && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Notes & Terms</div>
              <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.6' }}>{form.notes || settings.payment_terms}</div>
            </div>
          )}
        </div>

        {settings.footer_note && (
          <div style={{ padding: '12px 32px', background: '#f7f7f5', textAlign: 'center', fontSize: '11px', color: '#888' }}>
            {settings.footer_note}
          </div>
        )}
      </div>

      {/* Settings Modal */}
      <Modal open={settingsModal} onClose={() => setSettingsModal(false)} title="Invoice Settings" width="xl"
        footer={<><Button variant="ghost" onClick={() => setSettingsModal(false)}>Cancel</Button><Button variant="primary" onClick={saveSettings}>Save Settings</Button></>}>
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-3">Logo</p>
            <div className="flex items-center gap-4">
              {settingsForm.logo_base64 ? (
                <div className="flex items-center gap-3">
                  <img src={settingsForm.logo_base64} alt="Logo" className="w-20 h-20 object-contain border border-[#e8e8e8]" />
                  <button type="button" onClick={() => setSettingsForm({ ...settingsForm, logo_base64: undefined })} className="text-xs text-[#DC2626] hover:underline">Remove</button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#070707] text-white hover:bg-[#1a1a1a]">Upload Logo</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => {
                    const file = e.target.files?.[0]; if (!file) return;
                    if (file.size > 500000) { toast('Logo too large (max 500KB)', 'error'); return; }
                    const reader = new FileReader();
                    reader.onload = ev => setSettingsForm({ ...settingsForm, logo_base64: ev.target?.result as string });
                    reader.readAsDataURL(file);
                  }} />
                </label>
              )}
              <p className="text-xs text-[#888]">PNG or JPG, max 500KB. Square works best.</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-3">Company Details</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Company Name" value={settingsForm.company_name} onChange={e => setSettingsForm({ ...settingsForm, company_name: e.target.value })} />
              <Input label="Email" value={settingsForm.email} onChange={e => setSettingsForm({ ...settingsForm, email: e.target.value })} />
              <Input label="Phone" value={settingsForm.phone} onChange={e => setSettingsForm({ ...settingsForm, phone: e.target.value })} />
              <Input label="GSTIN" value={settingsForm.gstin} onChange={e => setSettingsForm({ ...settingsForm, gstin: e.target.value })} />
              <Input label="PAN" value={settingsForm.pan} onChange={e => setSettingsForm({ ...settingsForm, pan: e.target.value })} />
              <Input label="City" value={settingsForm.city} onChange={e => setSettingsForm({ ...settingsForm, city: e.target.value })} />
              <Textarea label="Address" value={settingsForm.address} onChange={e => setSettingsForm({ ...settingsForm, address: e.target.value })} rows={2} />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-3">Bank Details</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Bank Name" value={settingsForm.bank_name} onChange={e => setSettingsForm({ ...settingsForm, bank_name: e.target.value })} />
              <Input label="Account Holder" value={settingsForm.account_holder} onChange={e => setSettingsForm({ ...settingsForm, account_holder: e.target.value })} />
              <Input label="Account Number" value={settingsForm.account_no} onChange={e => setSettingsForm({ ...settingsForm, account_no: e.target.value })} />
              <Input label="IFSC Code" value={settingsForm.ifsc} onChange={e => setSettingsForm({ ...settingsForm, ifsc: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Textarea label="Payment Terms" value={settingsForm.payment_terms || ''} onChange={e => setSettingsForm({ ...settingsForm, payment_terms: e.target.value })} rows={2} />
            <Textarea label="Footer Note" value={settingsForm.footer_note || ''} onChange={e => setSettingsForm({ ...settingsForm, footer_note: e.target.value })} rows={2} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
