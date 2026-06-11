import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Play, RefreshCw, Bell, MessageCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Card, MetricCard } from '@/components/ui/Card';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import {
  getRecurringTemplates, addRecurringTemplate, updateRecurringTemplate, deleteRecurringTemplate,
  getCategories, getClients, addCashTransaction, addAuditEntry,
  getPaymentReminderConfig, setPaymentReminderConfig,
  getInvoices, getAppSettings,
} from '@/lib/storage';
import { getPaymentsByClient } from '@/lib/payments';
import type { RecurringTemplate } from '@/lib/storage';
import { formatCurrency, currentMonth, formatMonth } from '@/utils/format';

export function RecurringTemplatesPage() {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<RecurringTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [applyingMonth, setApplyingMonth] = useState(currentMonth());
  const [confirmApply, setConfirmApply] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);

  const categories = getCategories();
  const clients = getClients().filter(c => c.status === 'active');
  const templates = getRecurringTemplates();
  const reminderConfig = getPaymentReminderConfig();

  const [reminderForm, setReminderForm] = useState(reminderConfig);

  const emptyForm = {
    label: '', type: 'cash' as 'cash' | 'bank', direction: 'out' as 'in' | 'out',
    amount: '', category_id: '', party: '', description: '',
    client_id: '', day_of_month: 1, active: true,
  };
  const [form, setForm] = useState(emptyForm);

  function openAdd() { setForm(emptyForm); setEditing(null); setModal(true); }
  function openEdit(t: RecurringTemplate) {
    setForm({ ...t, amount: t.amount.toString(), client_id: t.client_id || '' });
    setEditing(t);
    setModal(true);
  }

  function save() {
    if (!form.label || !form.amount || !form.party) { toast('Fill in label, amount, and party', 'error'); return; }
    const payload = { ...form, amount: Number(form.amount), client_id: form.client_id || undefined };
    if (editing) {
      updateRecurringTemplate(editing.id, payload);
      toast('Template updated', 'success');
    } else {
      addRecurringTemplate(payload);
      toast('Template created', 'success');
    }
    setModal(false);
  }

  function applyTemplates() {
    const active = templates.filter(t => t.active);
    const dateStr = `${applyingMonth}-${String(active[0]?.day_of_month || 1).padStart(2, '0')}`;
    let added = 0;
    active.forEach(t => {
      if (t.type === 'cash') {
        const day = String(t.day_of_month).padStart(2, '0');
        addCashTransaction({
          date: `${applyingMonth}-${day}`,
          type: t.direction === 'in' ? 'Cash In' : 'Cash Out',
          amount: t.amount, category_id: t.category_id,
          party: t.party, description: t.description,
          client_id: t.client_id, tags: ['recurring'],
          created_by: 'founder',
        });
        added++;
      }
    });
    addAuditEntry({ user_id: 'founder', action: 'APPLY_RECURRING', entity: 'recurring', metadata: { month: applyingMonth, count: added } });
    toast(`Applied ${added} recurring entries for ${formatMonth(applyingMonth)}`, 'success');
    setConfirmApply(false);
  }

  // Build overdue reminder message
  function buildReminderMessage(): string {
    const today = new Date().toISOString().split('T')[0];
    const activeClients = clients;
    const lines: string[] = ['*Respawn Media — Payment Reminder*', ''];
    let hasOverdue = false;

    activeClients.forEach(client => {
      const invoices = getInvoices().filter(i =>
        i.client_id === client.id &&
        ['Sent', 'Partially Paid'].includes(i.status) &&
        i.due_date < today
      );
      const totalPaid = getPaymentsByClient(client.id)
        .filter(p => p.for_month === currentMonth())
        .reduce((s, p) => s + p.amount, 0);

      if (invoices.length > 0) {
        hasOverdue = true;
        const totalDue = invoices.reduce((s, i) => s + i.total, 0);
        const days = Math.floor((new Date(today).getTime() - new Date(invoices[0].due_date).getTime()) / 86400000);
        lines.push(`• *${client.name}*: ₹${(totalDue).toLocaleString('en-IN')} overdue (${days}d)`);
        if (totalPaid > 0) lines.push(`  Partial received: ₹${totalPaid.toLocaleString('en-IN')}`);
      }
    });

    if (!hasOverdue) {
      lines.push('✅ All client payments are up to date!');
    }

    lines.push('', `_${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}_`);
    return lines.join('\n');
  }

  async function sendWhatsAppReminder() {
    if (!reminderConfig.whatsapp_numbers.length) {
      toast('Add WhatsApp numbers in settings first', 'error'); return;
    }
    setSendingReminder(true);
    const message = buildReminderMessage();
    let successCount = 0;
    for (const num of reminderConfig.whatsapp_numbers) {
      try {
        const res = await fetch('/api/send-whatsapp', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: num.trim(), message }),
        });
        if (res.ok) successCount++;
        else {
          const err = await res.json();
          toast(`Failed to send to ${num}: ${err.error}`, 'error');
        }
      } catch { toast(`Failed to send to ${num}`, 'error'); }
    }
    if (successCount > 0) toast(`WhatsApp reminder sent to ${successCount} number${successCount > 1 ? 's' : ''}`, 'success');
    addAuditEntry({ user_id: 'founder', action: 'SEND_WHATSAPP_REMINDER', entity: 'payment_reminder', metadata: { count: successCount } });
    setSendingReminder(false);
  }

  function saveReminderSettings() {
    setPaymentReminderConfig(reminderForm);
    toast('Reminder settings saved', 'success');
  }

  return (
    <div className="p-4 lg:p-6 max-w-[900px]">
      <PageHeader title="Recurring & Reminders" subtitle="Templates, scheduled entries, payment alerts" />

      {/* Recurring Templates */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555]">
            <RefreshCw className="w-4 h-4 inline mr-1.5" />Recurring Entry Templates
          </h3>
          <Button size="sm" variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={openAdd}>Add Template</Button>
        </div>

        <p className="text-xs text-[#888] mb-4">
          Define entries that repeat every month — rent, salaries, subscriptions. Apply them all in one click at the start of each month.
        </p>

        {templates.length === 0 ? (
          <p className="text-sm text-[#888] text-center py-6">No templates yet. Add your first recurring entry.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {templates.map(t => {
              const cat = categories.find(c => c.id === t.category_id);
              const client = clients.find(c => c.id === t.client_id);
              return (
                <div key={t.id} className="flex items-center justify-between py-2.5 px-3 bg-[#f7f7f5]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-6 h-6 flex items-center justify-center text-xs font-bold ${t.direction === 'in' ? 'bg-[#dcfce7] text-[#16A34A]' : 'bg-[#fee2e2] text-[#DC2626]'}`}>
                      {t.direction === 'in' ? '+' : '-'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#070707]">{t.label}</p>
                      <p className="text-xs text-[#888]">
                        {t.party} · Day {t.day_of_month} of month
                        {cat ? ` · ${cat.name}` : ''}
                        {client ? ` · ${client.name}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium tabular-nums">{formatCurrency(t.amount)}</span>
                    {!t.active && <Badge variant="gray">Inactive</Badge>}
                    <button onClick={() => openEdit(t)} className="text-[#888] hover:text-[#070707]"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDeleteId(t.id)} className="text-[#888] hover:text-[#DC2626]"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {templates.filter(t => t.active).length > 0 && (
          <div className="flex items-center gap-3 pt-3 border-t border-[#f0f0f0]">
            <span className="text-sm text-[#555]">Apply for:</span>
            <input type="month" value={applyingMonth} onChange={e => setApplyingMonth(e.target.value)}
              className="px-3 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
            <Button variant="primary" size="sm" icon={<Play className="w-3.5 h-3.5" />} onClick={() => setConfirmApply(true)}>
              Apply {templates.filter(t => t.active).length} Entries
            </Button>
          </div>
        )}
      </Card>

      {/* Payment Reminders */}
      <Card className="mb-6">
        <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
          <Bell className="w-4 h-4 inline mr-1.5" />Payment Reminders
        </h3>

        <div className="space-y-4 mb-5">
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div>
              <label className="text-xs font-medium text-[#555] uppercase tracking-wide block mb-1">Remind on day of month</label>
              <input type="number" min="1" max="28" value={reminderForm.remind_day}
                onChange={e => setReminderForm({ ...reminderForm, remind_day: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
              <p className="text-xs text-[#aaa] mt-1">Smart questions will highlight overdue payments from this day onwards</p>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm text-[#555] cursor-pointer mt-5">
                <input type="checkbox" checked={reminderForm.enabled} onChange={e => setReminderForm({ ...reminderForm, enabled: e.target.checked })} className="w-4 h-4" />
                Reminders active
              </label>
            </div>
          </div>
        </div>

        {/* WhatsApp */}
        <div className="border-t border-[#f0f0f0] pt-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className="w-4 h-4 text-[#16A34A]" />
            <h4 className="text-sm font-semibold text-[#070707]">WhatsApp Alerts</h4>
            <Badge variant={reminderForm.whatsapp_enabled ? 'green' : 'gray'}>
              {reminderForm.whatsapp_enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>

          <div className="bg-[#f7f7f5] px-3 py-2 text-xs text-[#666] mb-3">
            <p className="font-medium text-[#555] mb-1">Setup (one time):</p>
            <ol className="list-decimal ml-3 space-y-0.5">
              <li>Sign up at <strong>twilio.com</strong> → get a free sandbox WhatsApp number</li>
              <li>Add <code className="bg-[#e8e8e8] px-1">TWILIO_ACCOUNT_SID</code>, <code className="bg-[#e8e8e8] px-1">TWILIO_AUTH_TOKEN</code> to Vercel env vars</li>
              <li>Each recipient texts <strong>"join &lt;sandbox-code&gt;"</strong> to +14155238886 once</li>
              <li>Enter numbers below and test</li>
            </ol>
          </div>

          <div className="space-y-3 max-w-md">
            <label className="flex items-center gap-2 text-sm text-[#555] cursor-pointer">
              <input type="checkbox" checked={reminderForm.whatsapp_enabled} onChange={e => setReminderForm({ ...reminderForm, whatsapp_enabled: e.target.checked })} className="w-4 h-4" />
              Send WhatsApp when reminder triggers
            </label>
            <div>
              <label className="text-xs font-medium text-[#555] uppercase tracking-wide block mb-1">
                WhatsApp numbers (one per line, include +91)
              </label>
              <textarea
                value={reminderForm.whatsapp_numbers.join('\n')}
                onChange={e => setReminderForm({ ...reminderForm, whatsapp_numbers: e.target.value.split('\n').map(n => n.trim()).filter(Boolean) })}
                placeholder="+919876543210&#10;+919123456789"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA] font-mono"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button variant="secondary" size="sm" onClick={saveReminderSettings}>Save Settings</Button>
            <Button variant="primary" size="sm" icon={<MessageCircle className="w-3.5 h-3.5" />}
              onClick={sendWhatsAppReminder} loading={sendingReminder}
              disabled={!reminderForm.whatsapp_numbers.length}>
              Send Reminder Now
            </Button>
          </div>

          {/* Preview message */}
          <div className="mt-4 border border-[#e8e8e8] p-3 bg-[#f7f7f5]">
            <p className="text-xs text-[#888] uppercase tracking-wide mb-2">Message preview</p>
            <pre className="text-xs text-[#555] whitespace-pre-wrap font-['DM_Sans']">{buildReminderMessage()}</pre>
          </div>
        </div>
      </Card>

      {/* Template Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Template' : 'New Recurring Template'} width="md"
        footer={<>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={save}>{editing ? 'Save' : 'Create Template'}</Button>
        </>}>
        <div className="space-y-4">
          <Input label="Template Label *" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. Office Rent, Ravi's Retainer, Google Workspace" />
          <div className="grid grid-cols-3 gap-3">
            <Select label="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as 'cash' | 'bank' })}
              options={[{ value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank' }]} />
            <Select label="Direction" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value as 'in' | 'out' })}
              options={[{ value: 'out', label: 'Out (expense)' }, { value: 'in', label: 'In (receipt)' }]} />
            <Input label="Day of month" type="number" min="1" max="28" value={form.day_of_month}
              onChange={e => setForm({ ...form, day_of_month: Number(e.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Amount (₹)" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" />
            <Select label="Category" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
              options={categories.map(c => ({ value: c.id, label: c.name }))} placeholder="Select" />
          </div>
          <Input label="Party" value={form.party} onChange={e => setForm({ ...form, party: e.target.value })} placeholder="Who you're paying / receiving from" />
          <Input label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What this is for" />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Client (optional)" value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}
              options={[{ value: '', label: 'Not client-specific' }, ...clients.map(c => ({ value: c.id, label: c.name }))]} />
            <div className="flex items-center mt-5">
              <label className="flex items-center gap-2 text-sm text-[#555] cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="w-4 h-4" />
                Active
              </label>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmModal open={confirmApply} onClose={() => setConfirmApply(false)} onConfirm={applyTemplates}
        title={`Apply recurring entries for ${formatMonth(applyingMonth)}?`}
        message={`This will create ${templates.filter(t => t.active).length} cash transactions for ${formatMonth(applyingMonth)}: ${templates.filter(t => t.active).map(t => `${t.label} (${formatCurrency(t.amount)})`).join(', ')}`}
        confirmLabel="Apply All" variant="primary" />
      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) { deleteRecurringTemplate(deleteId); toast('Deleted', 'info'); setDeleteId(null); } }}
        title="Delete Template" message="Remove this recurring template?" />
    </div>
  );
}
