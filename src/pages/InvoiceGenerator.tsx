import React, { useState, useRef } from 'react';
import { Plus, Trash2, Download, Settings } from 'lucide-react';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastProvider';
import { getInvoiceSettings, setInvoiceSettings, getClients, addAuditEntry } from '@/lib/storage';
import { formatCurrency, formatDate } from '@/utils/format';
import type { InvoiceSettings } from '@/types';

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

const EMPTY_SETTINGS: InvoiceSettings = {
  company_name: 'Respawn Media', address: '', city: 'Chennai', state: 'Tamil Nadu',
  pincode: '600001', gstin: '', pan: '', phone: '', email: '',
  bank_name: '', account_no: '', ifsc: '', account_holder: '',
  footer_note: 'Thank you for your business!',
  payment_terms: 'Payment due within 15 days of invoice date.',
};

export function InvoiceGeneratorPage() {
  const toast = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [settingsModal, setSettingsModal] = useState(false);
  const [settings, setSettings] = useState<InvoiceSettings>(getInvoiceSettings() || EMPTY_SETTINGS);
  const [settingsForm, setSettingsForm] = useState<InvoiceSettings>(getInvoiceSettings() || EMPTY_SETTINGS);

  const clients = getClients();
  const clientOptions = [{ value: '', label: 'Select client (optional)' }, ...clients.map(c => ({ value: c.id, label: c.name }))];

  // Invoice form
  const [form, setForm] = useState({
    invoice_no: `RM-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-001`,
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
      if (field === 'quantity' || field === 'rate') {
        updated.amount = Number(updated.quantity) * Number(updated.rate);
      }
      return updated;
    }));
  }

  function addLine() {
    setLineItems(prev => [...prev, { id: crypto.randomUUID(), description: '', quantity: 1, rate: 0, amount: 0 }]);
  }

  function removeLine(id: string) {
    if (lineItems.length === 1) return;
    setLineItems(prev => prev.filter(l => l.id !== id));
  }

  function handleClientSelect(clientId: string) {
    const client = clients.find(c => c.id === clientId);
    setForm(f => ({
      ...f, client_id: clientId,
      client_name: client?.name || '',
      client_gstin: client?.gstin || '',
    }));
  }

  function saveSettings() {
    setInvoiceSettings(settingsForm);
    setSettings(settingsForm);
    toast('Invoice settings saved', 'success');
    setSettingsModal(false);
  }

  function handlePrint() {
    addAuditEntry({ user_id: 'founder', action: 'GENERATE_INVOICE', entity: 'invoice', metadata: { invoice_no: form.invoice_no } });
    window.print();
  }

  // Number to words (Indian)
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

  return (
    <div className="p-6 max-w-[1100px]">
      <style>{`@media print { .no-print { display: none !important; } body { print-color-adjust: exact; } }`}</style>
      <div className="no-print">
        <PageHeader
          title="Invoice Generator"
          subtitle="Create professional invoices for your clients"
          actions={
            <div className="flex gap-2">
              <Button variant="secondary" icon={<Settings className="w-4 h-4" />} onClick={() => { setSettingsForm(settings); setSettingsModal(true); }}>
                Invoice Settings
              </Button>
              <Button variant="primary" icon={<Download className="w-4 h-4" />} onClick={handlePrint}>
                Print / Save PDF
              </Button>
            </div>
          }
        />

        {!settings.company_name && (
          <div className="mb-4 bg-[#fef3c7] border border-[#F59E0B] px-4 py-3 text-sm text-[#92400e]">
            Set up your invoice details first — click "Invoice Settings" above.
          </div>
        )}

        {/* Invoice fields */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5 no-print">
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
              <Input label="Client Name" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} placeholder="Client or company name" />
              <Textarea label="Client Address" value={form.client_address} onChange={e => setForm({ ...form, client_address: e.target.value })} rows={2} />
              <Input label="Client GSTIN" value={form.client_gstin} onChange={e => setForm({ ...form, client_gstin: e.target.value })} placeholder="22XXXXX..." />
            </div>
          </Card>
          <Card>
            <h3 className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-3">Notes</h3>
            <Textarea label="Notes / Terms" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={5} placeholder="Any specific notes for this invoice..." />
          </Card>
        </div>

        {/* Line items editor */}
        <Card className="mb-5 no-print">
          <h3 className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-3">Line Items</h3>
          <div className="space-y-2 mb-3">
            <div className="grid grid-cols-12 gap-2 text-xs text-[#888] uppercase tracking-wide pb-1 border-b border-[#f0f0f0]">
              <span className="col-span-5">Description</span><span className="col-span-2 text-right">Qty</span>
              <span className="col-span-2 text-right">Rate (₹)</span><span className="col-span-2 text-right">Amount (₹)</span><span className="col-span-1" />
            </div>
            {lineItems.map(line => (
              <div key={line.id} className="grid grid-cols-12 gap-2 items-center">
                <input value={line.description} onChange={e => updateLineItem(line.id, 'description', e.target.value)}
                  className="col-span-5 px-2 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" placeholder="Service description" />
                <input type="number" value={line.quantity} onChange={e => updateLineItem(line.id, 'quantity', Number(e.target.value))}
                  className="col-span-2 px-2 py-1.5 text-sm text-right border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                <input type="number" value={line.rate || ''} onChange={e => updateLineItem(line.id, 'rate', Number(e.target.value))}
                  className="col-span-2 px-2 py-1.5 text-sm text-right border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" placeholder="0" />
                <span className="col-span-2 text-right text-sm font-medium tabular-nums">{formatCurrency(line.amount)}</span>
                <button onClick={() => removeLine(line.id)} className="col-span-1 text-[#ccc] hover:text-[#DC2626] flex justify-end"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="secondary" icon={<Plus className="w-3 h-3" />} onClick={addLine}>Add Line</Button>
          <div className="mt-4 border-t border-[#f0f0f0] pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-[#888]">Subtotal</span><span className="tabular-nums">{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">GST @ {form.gst_rate}%</span><span className="tabular-nums">{formatCurrency(gstAmount)}</span></div>
            <div className="flex justify-between font-bold text-base border-t border-[#e0e0e0] pt-2"><span>Total</span><span className="tabular-nums">{formatCurrency(total)}</span></div>
          </div>
        </Card>
      </div>

      {/* ── PRINT-READY INVOICE ── */}
      <div ref={printRef} className="bg-white border border-[#e8e8e8] print:border-0 print:shadow-none">
        {/* Header */}
        <div className="flex justify-between items-start p-8 border-b border-[#e8e8e8]">
          <div>
            <h1 className="font-['Barlow_Condensed'] text-3xl font-black text-[#070707] uppercase tracking-wider">{settings.company_name}</h1>
            <div className="text-xs text-[#666] mt-1 space-y-0.5">
              {settings.address && <p>{settings.address}</p>}
              <p>{[settings.city, settings.state, settings.pincode].filter(Boolean).join(', ')}</p>
              {settings.phone && <p>Ph: {settings.phone}</p>}
              {settings.email && <p>{settings.email}</p>}
              {settings.gstin && <p>GSTIN: {settings.gstin}</p>}
              {settings.pan && <p>PAN: {settings.pan}</p>}
            </div>
          </div>
          <div className="text-right">
            <div className="bg-[#070707] text-white px-6 py-2 mb-3">
              <p className="font-['Barlow_Condensed'] text-2xl font-bold uppercase tracking-wider">Invoice</p>
            </div>
            <div className="text-xs text-[#666] space-y-1">
              <p><span className="font-semibold text-[#333]">Invoice No: </span>{form.invoice_no}</p>
              <p><span className="font-semibold text-[#333]">Date: </span>{formatDate(form.invoice_date)}</p>
              {form.due_date && <p><span className="font-semibold text-[#333]">Due Date: </span>{formatDate(form.due_date)}</p>}
            </div>
          </div>
        </div>

        {/* Bill to */}
        <div className="px-8 py-5 border-b border-[#f0f0f0]">
          <p className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-2">Bill To</p>
          <p className="font-semibold text-[#070707]">{form.client_name || 'Client Name'}</p>
          {form.client_address && <p className="text-xs text-[#666] mt-0.5 whitespace-pre-line">{form.client_address}</p>}
          {form.client_gstin && <p className="text-xs text-[#666] mt-0.5">GSTIN: {form.client_gstin}</p>}
        </div>

        {/* Line items */}
        <div className="px-8 py-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#070707]">
                <th className="text-left py-2 text-xs uppercase tracking-wide text-[#555] w-8">#</th>
                <th className="text-left py-2 text-xs uppercase tracking-wide text-[#555]">Description</th>
                <th className="text-right py-2 text-xs uppercase tracking-wide text-[#555] w-16">Qty</th>
                <th className="text-right py-2 text-xs uppercase tracking-wide text-[#555] w-24">Rate</th>
                <th className="text-right py-2 text-xs uppercase tracking-wide text-[#555] w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line, i) => (
                <tr key={line.id} className="border-b border-[#f0f0f0]">
                  <td className="py-2.5 text-[#888] text-xs">{i + 1}</td>
                  <td className="py-2.5 text-[#333]">{line.description}</td>
                  <td className="py-2.5 text-right tabular-nums text-[#333]">{line.quantity}</td>
                  <td className="py-2.5 text-right tabular-nums text-[#333]">{formatCurrency(line.rate)}</td>
                  <td className="py-2.5 text-right tabular-nums font-medium">{formatCurrency(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end mt-4">
            <div className="w-64 space-y-1.5 text-sm">
              <div className="flex justify-between py-1"><span className="text-[#888]">Subtotal</span><span className="tabular-nums">{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between py-1"><span className="text-[#888]">CGST @ {form.gst_rate / 2}%</span><span className="tabular-nums">{formatCurrency(gstAmount / 2)}</span></div>
              <div className="flex justify-between py-1"><span className="text-[#888]">SGST @ {form.gst_rate / 2}%</span><span className="tabular-nums">{formatCurrency(gstAmount / 2)}</span></div>
              <div className="flex justify-between py-2 border-t-2 border-[#070707] font-bold text-base">
                <span>Total</span><span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-[#888] mt-2 italic">{toWords(Math.round(total))}</p>
        </div>

        {/* Bank details + notes */}
        <div className="px-8 py-5 border-t border-[#f0f0f0] grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-2">Payment Details</p>
            <div className="text-xs text-[#666] space-y-0.5">
              {settings.bank_name && <p><span className="text-[#333] font-medium">Bank:</span> {settings.bank_name}</p>}
              {settings.account_holder && <p><span className="text-[#333] font-medium">Account Name:</span> {settings.account_holder}</p>}
              {settings.account_no && <p><span className="text-[#333] font-medium">Account No:</span> {settings.account_no}</p>}
              {settings.ifsc && <p><span className="text-[#333] font-medium">IFSC:</span> {settings.ifsc}</p>}
            </div>
          </div>
          <div>
            {(form.notes || settings.payment_terms) && (
              <>
                <p className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-2">Notes</p>
                <p className="text-xs text-[#666]">{form.notes || settings.payment_terms}</p>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        {settings.footer_note && (
          <div className="px-8 py-4 bg-[#f7f7f5] text-center">
            <p className="text-xs text-[#888]">{settings.footer_note}</p>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      <Modal open={settingsModal} onClose={() => setSettingsModal(false)} title="Invoice Settings" width="xl"
        footer={<>
          <Button variant="ghost" onClick={() => setSettingsModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={saveSettings}>Save Settings</Button>
        </>}>
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-3">Company Details</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Company Name" value={settingsForm.company_name} onChange={e => setSettingsForm({ ...settingsForm, company_name: e.target.value })} />
              <Input label="Email" value={settingsForm.email} onChange={e => setSettingsForm({ ...settingsForm, email: e.target.value })} />
              <Input label="Phone" value={settingsForm.phone} onChange={e => setSettingsForm({ ...settingsForm, phone: e.target.value })} />
              <Input label="GSTIN" value={settingsForm.gstin} onChange={e => setSettingsForm({ ...settingsForm, gstin: e.target.value })} />
              <Input label="PAN" value={settingsForm.pan} onChange={e => setSettingsForm({ ...settingsForm, pan: e.target.value })} />
              <Input label="Pincode" value={settingsForm.pincode} onChange={e => setSettingsForm({ ...settingsForm, pincode: e.target.value })} />
            </div>
            <div className="mt-3">
              <Textarea label="Address" value={settingsForm.address} onChange={e => setSettingsForm({ ...settingsForm, address: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Input label="City" value={settingsForm.city} onChange={e => setSettingsForm({ ...settingsForm, city: e.target.value })} />
              <Input label="State" value={settingsForm.state} onChange={e => setSettingsForm({ ...settingsForm, state: e.target.value })} />
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
