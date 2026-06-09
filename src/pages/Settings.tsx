import React, { useState } from 'react';
import { Plus, Trash2, Download, Upload, AlertTriangle, Eye } from 'lucide-react';
import CryptoJS from 'crypto-js';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import {
  getCategories, addCategory, updateCategory, deleteCategory,
  getAuditLog, exportAllData, importAllData, clearAllData,
  getAppSettings, updateAppSettings, getTaxSettings, setTaxSettings,
  addAuditEntry
} from '@/lib/storage';
import type { Category } from '@/types';

export function SettingsPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'categories' | 'app' | 'tax' | 'backup' | 'audit'>('categories');
  const [newCat, setNewCat] = useState({ name: '', type: 'expense' as Category['type'] });
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [backupModal, setBackupModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const categories = getCategories();
  const auditLog = getAuditLog();
  const settings = getAppSettings();
  const taxSettings = getTaxSettings();

  function addCat() {
    if (!newCat.name.trim()) return;
    addCategory({ name: newCat.name.trim(), type: newCat.type, is_custom: true });
    setNewCat({ name: '', type: 'expense' });
    toast('Category added', 'success');
  }

  async function handleExportBackup() {
    if (!backupPassword) return;
    setLoading(true);
    try {
      const data = exportAllData();
      const json = JSON.stringify(data);
      const encrypted = CryptoJS.AES.encrypt(json, backupPassword).toString();
      const blob = new Blob([encrypted], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `respawn-finance-backup-${new Date().toISOString().split('T')[0]}.rfb`;
      a.click();
      URL.revokeObjectURL(url);
      addAuditEntry({ user_id: 'founder', action: 'EXPORT_BACKUP', entity: 'settings' });
      toast('Backup downloaded', 'success');
      setBackupModal(false);
      setBackupPassword('');
    } catch {
      toast('Backup failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleImportBackup(file: File) {
    if (!restorePassword) {
      toast('Enter the backup password first', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const encrypted = e.target?.result as string;
        const decrypted = CryptoJS.AES.decrypt(encrypted, restorePassword).toString(CryptoJS.enc.Utf8);
        if (!decrypted) throw new Error('Wrong password');
        const data = JSON.parse(decrypted);
        importAllData(data);
        addAuditEntry({ user_id: 'founder', action: 'IMPORT_BACKUP', entity: 'settings' });
        toast('Backup restored. Refresh the page.', 'success');
        setTimeout(() => window.location.reload(), 1500);
      } catch {
        toast('Restore failed — check your password', 'error');
      }
    };
    reader.readAsText(file);
  }

  function handleClearData() {
    clearAllData();
    addAuditEntry({ user_id: 'founder', action: 'CLEAR_ALL_DATA', entity: 'settings' });
    toast('All data cleared. Refresh the page.', 'info');
    setTimeout(() => window.location.reload(), 1500);
    setClearConfirm(false);
  }

  const TABS = [
    { id: 'categories', label: 'Categories' },
    { id: 'app', label: 'General' },
    { id: 'tax', label: 'Tax Config' },
    { id: 'backup', label: 'Backup & Restore' },
    { id: 'audit', label: 'Audit Log' },
  ] as const;

  return (
    <div className="p-6 max-w-[900px]">
      <PageHeader title="Settings" />

      {/* Tabs */}
      <div className="flex border-b border-[#e8e8e8] mb-6">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'text-[#070707] border-b-2 border-[#16C4BA] -mb-px' : 'text-[#888] hover:text-[#555]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <Card>
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
            Transaction Categories
          </h3>
          <div className="flex gap-3 mb-5">
            <input
              value={newCat.name}
              onChange={e => setNewCat({ ...newCat, name: e.target.value })}
              placeholder="New category name..."
              className="flex-1 px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]"
              onKeyDown={e => e.key === 'Enter' && addCat()}
            />
            <select
              value={newCat.type}
              onChange={e => setNewCat({ ...newCat, type: e.target.value as Category['type'] })}
              className="px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]"
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="both">Both</option>
            </select>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={addCat}>Add</Button>
          </div>
          <div className="space-y-1">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between py-2 border-b border-[#f5f5f5] last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[#070707]">{cat.name}</span>
                  <Badge variant={cat.type === 'income' ? 'green' : cat.type === 'expense' ? 'red' : 'gray'}>{cat.type}</Badge>
                  {cat.is_custom && <Badge variant="teal">custom</Badge>}
                </div>
                {cat.is_custom && (
                  <button onClick={() => setDeleteCatId(cat.id)} className="text-[#888] hover:text-[#DC2626]">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* General Tab */}
      {activeTab === 'app' && (
        <Card>
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">General Settings</h3>
          <div className="space-y-4 max-w-sm">
            <Input
              label="Cash Opening Balance (₹)"
              type="number"
              value={settings.cash_opening_balance.toString()}
              onChange={e => updateAppSettings({ cash_opening_balance: Number(e.target.value) })}
            />
            <Input
              label="Cash Holder"
              value={settings.cash_holder}
              onChange={e => updateAppSettings({ cash_holder: e.target.value })}
              placeholder="Who holds the petty cash?"
            />
          </div>
        </Card>
      )}

      {/* Tax Config Tab */}
      {activeTab === 'tax' && (
        <Card>
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">Tax Configuration</h3>
          {taxSettings ? (
            <div className="grid grid-cols-2 gap-4 max-w-lg">
              <Select
                label="Business Structure"
                value={taxSettings.business_structure}
                onChange={e => setTaxSettings({ ...taxSettings, business_structure: e.target.value as typeof taxSettings.business_structure })}
                options={[
                  { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
                  { value: 'partnership', label: 'Partnership' },
                  { value: 'llp', label: 'LLP' },
                  { value: 'pvt_ltd', label: 'Pvt Ltd' },
                ]}
              />
              <Input label="GSTIN" value={taxSettings.gstin} onChange={e => setTaxSettings({ ...taxSettings, gstin: e.target.value })} placeholder="22XXXXX..." />
              <Input label="PAN" value={taxSettings.pan} onChange={e => setTaxSettings({ ...taxSettings, pan: e.target.value })} placeholder="ABCDE1234F" />
              <Input label="GST Rate (%)" type="number" value={taxSettings.gst_rate.toString()} onChange={e => setTaxSettings({ ...taxSettings, gst_rate: Number(e.target.value) })} />
              <Input label="State" value={taxSettings.state} onChange={e => setTaxSettings({ ...taxSettings, state: e.target.value })} />
            </div>
          ) : <p className="text-sm text-[#888]">Tax settings not found. Refresh the page.</p>}
        </Card>
      )}

      {/* Backup Tab */}
      {activeTab === 'backup' && (
        <div className="space-y-4">
          <Card>
            <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
              <Download className="w-4 h-4 inline mr-2" />
              Export Backup
            </h3>
            <p className="text-sm text-[#555] mb-4">
              Downloads all your data as an AES-encrypted file. Set a strong password — you'll need it to restore.
            </p>
            <div className="flex gap-3 max-w-sm">
              <Input
                label="Backup Password"
                type="password"
                value={backupPassword}
                onChange={e => setBackupPassword(e.target.value)}
                placeholder="Set a strong password"
              />
            </div>
            <Button variant="primary" className="mt-3" icon={<Download className="w-4 h-4" />}
              onClick={handleExportBackup} loading={loading} disabled={!backupPassword}>
              Download Encrypted Backup
            </Button>
          </Card>

          <Card>
            <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
              <Upload className="w-4 h-4 inline mr-2" />
              Restore from Backup
            </h3>
            <div className="bg-[#fef3c7] border border-[#F59E0B] px-3 py-2 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#d97706]" />
              <p className="text-xs text-[#92400e]">Restoring overwrites all current data.</p>
            </div>
            <div className="space-y-3 max-w-sm">
              <Input
                label="Backup Password"
                type="password"
                value={restorePassword}
                onChange={e => setRestorePassword(e.target.value)}
                placeholder="Enter backup password"
              />
              <label className="block cursor-pointer">
                <span className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#070707] text-white hover:bg-[#1a1a1a] transition-colors">
                  <Upload className="w-4 h-4" />
                  Choose Backup File (.rfb)
                </span>
                <input
                  type="file"
                  accept=".rfb"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImportBackup(f); }}
                />
              </label>
            </div>
          </Card>

          <Card>
            <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#DC2626] mb-4">
              Danger Zone
            </h3>
            <p className="text-sm text-[#555] mb-3">Permanently delete all data. Make sure you have a backup first.</p>
            <Button variant="danger" onClick={() => setClearConfirm(true)}>Clear All Data</Button>
          </Card>
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === 'audit' && (
        <Card padding="none">
          <div className="px-5 py-4 border-b border-[#e8e8e8]">
            <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555]">
              <Eye className="w-4 h-4 inline mr-2" />
              Audit Log — Last {auditLog.length} events
            </h3>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {auditLog.length === 0 ? (
              <p className="text-sm text-[#888] p-5">No audit events yet.</p>
            ) : (
              auditLog.map(entry => (
                <div key={entry.id} className="flex items-start gap-4 px-5 py-3 border-b border-[#f5f5f5] last:border-0">
                  <span className="text-xs text-[#888] flex-shrink-0 w-32 mt-0.5">
                    {new Date(entry.timestamp).toLocaleDateString('en-IN')} {new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-[#070707]">{entry.action}</span>
                    <span className="text-xs text-[#888] ml-2">{entry.entity}</span>
                    {entry.entity_id && <span className="text-xs text-[#bbb] ml-2 truncate">{entry.entity_id.slice(0, 8)}…</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      <ConfirmModal
        open={!!deleteCatId}
        onClose={() => setDeleteCatId(null)}
        onConfirm={() => { if (deleteCatId) { deleteCategory(deleteCatId); toast('Category deleted', 'info'); setDeleteCatId(null); } }}
        title="Delete Category"
        message="Delete this category? Existing transactions with this category won't be affected."
      />

      <ConfirmModal
        open={clearConfirm}
        onClose={() => setClearConfirm(false)}
        onConfirm={handleClearData}
        title="Clear All Data"
        message="This will permanently delete ALL transactions, clients, invoices, and settings. There is no undo. Make sure you have a backup."
        confirmLabel="Delete Everything"
        variant="danger"
      />
    </div>
  );
}
