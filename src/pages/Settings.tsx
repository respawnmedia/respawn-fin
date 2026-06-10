import React, { useState } from 'react';
import { Plus, Trash2, Download, Upload, AlertTriangle, Eye, Edit2, Check } from 'lucide-react';
import CryptoJS from 'crypto-js';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
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

const CASH_HOLDERS = ['Shlok', 'Tanay', 'Arihant', 'Other'];

export function SettingsPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'categories' | 'app' | 'tax' | 'backup' | 'audit'>('categories');
  const [newCat, setNewCat] = useState({ name: '', type: 'expense' as Category['type'], description: '' });
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editCatForm, setEditCatForm] = useState({ name: '', type: 'expense' as Category['type'], description: '' });
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const categories = getCategories();
  const auditLog = getAuditLog();
  const settings = getAppSettings();
  const taxSettings = getTaxSettings();

  function addCat() {
    if (!newCat.name.trim()) return;
    addCategory({ name: newCat.name.trim(), type: newCat.type, is_custom: true, description: newCat.description });
    setNewCat({ name: '', type: 'expense', description: '' });
    toast('Category added', 'success');
  }

  function startEditCat(cat: Category) {
    setEditingCat(cat);
    setEditCatForm({ name: cat.name, type: cat.type, description: cat.description || '' });
  }
  function saveEditCat() {
    if (!editingCat) return;
    updateCategory(editingCat.id, { name: editCatForm.name, type: editCatForm.type, description: editCatForm.description });
    setEditingCat(null);
    toast('Category updated', 'success');
  }

  async function handleExportBackup() {
    if (!backupPassword) return;
    setLoading(true);
    try {
      const data = exportAllData();
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), backupPassword).toString();
      const blob = new Blob([encrypted], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `respawn-finance-backup-${new Date().toISOString().split('T')[0]}.rfb`;
      a.click();
      URL.revokeObjectURL(url);
      addAuditEntry({ user_id: 'founder', action: 'EXPORT_BACKUP', entity: 'settings' });
      toast('Backup downloaded', 'success');
      setBackupPassword('');
    } catch { toast('Backup failed', 'error'); }
    finally { setLoading(false); }
  }

  function handleImportBackup(file: File) {
    if (!restorePassword) { toast('Enter the backup password first', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const decrypted = CryptoJS.AES.decrypt(e.target?.result as string, restorePassword).toString(CryptoJS.enc.Utf8);
        if (!decrypted) throw new Error('Wrong password');
        importAllData(JSON.parse(decrypted));
        addAuditEntry({ user_id: 'founder', action: 'IMPORT_BACKUP', entity: 'settings' });
        toast('Backup restored. Refreshing...', 'success');
        setTimeout(() => window.location.reload(), 1500);
      } catch { toast('Restore failed — check your password', 'error'); }
    };
    reader.readAsText(file);
  }

  function handleClearData() {
    clearAllData();
    addAuditEntry({ user_id: 'founder', action: 'CLEAR_ALL_DATA', entity: 'settings' });
    toast('All data cleared. Refreshing...', 'info');
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

  const catsByType = {
    income: categories.filter(c => c.type === 'income'),
    expense: categories.filter(c => c.type === 'expense'),
    both: categories.filter(c => c.type === 'both'),
  };

  return (
    <div className="p-6 max-w-[900px]">
      <PageHeader title="Settings" />

      {/* Tabs */}
      <div className="flex border-b border-[#e8e8e8] mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.id ? 'text-[#070707] border-b-2 border-[#16C4BA] -mb-px' : 'text-[#888] hover:text-[#555]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <Card>
            <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-3">Add New Category</h3>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <input value={newCat.name} onChange={e => setNewCat({ ...newCat, name: e.target.value })} placeholder="Category name" onKeyDown={e => e.key === 'Enter' && addCat()}
                className="px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
              <select value={newCat.type} onChange={e => setNewCat({ ...newCat, type: e.target.value as Category['type'] })}
                className="px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="both">Both</option>
              </select>
            </div>
            <input value={newCat.description} onChange={e => setNewCat({ ...newCat, description: e.target.value })} placeholder="Description (optional)"
              className="w-full px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA] mb-2" />
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={addCat}>Add Category</Button>
          </Card>

          {(['income', 'expense', 'both'] as const).map(type => (
            <Card key={type}>
              <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-3">
                {type === 'income' ? 'Income' : type === 'expense' ? 'Expense' : 'Both'} Categories
                <span className="ml-2 text-xs font-normal text-[#888]">({catsByType[type].length})</span>
              </h3>
              <div className="space-y-1">
                {catsByType[type].map(cat => (
                  <div key={cat.id}>
                    {editingCat?.id === cat.id ? (
                      <div className="flex items-center gap-2 py-1.5">
                        <input value={editCatForm.name} onChange={e => setEditCatForm({ ...editCatForm, name: e.target.value })}
                          className="flex-1 px-2 py-1 text-sm border border-[#16C4BA] focus:outline-none" />
                        <select value={editCatForm.type} onChange={e => setEditCatForm({ ...editCatForm, type: e.target.value as Category['type'] })}
                          className="px-2 py-1 text-sm border border-[#ddd] focus:outline-none">
                          <option value="income">Income</option><option value="expense">Expense</option><option value="both">Both</option>
                        </select>
                        <input value={editCatForm.description} onChange={e => setEditCatForm({ ...editCatForm, description: e.target.value })}
                          placeholder="Description" className="flex-1 px-2 py-1 text-sm border border-[#ddd] focus:outline-none" />
                        <button onClick={saveEditCat} className="text-[#16C4BA] hover:text-[#13b0a7]"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingCat(null)} className="text-[#888] text-xs">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between py-2 border-b border-[#f5f5f5] last:border-0">
                        <div>
                          <span className="text-sm text-[#070707]">{cat.name}</span>
                          {cat.description && <span className="text-xs text-[#888] ml-2">— {cat.description}</span>}
                          {cat.is_custom && <Badge variant="teal" className="ml-2">custom</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEditCat(cat)} className="text-[#888] hover:text-[#070707]"><Edit2 className="w-3 h-3" /></button>
                          {cat.is_custom && (
                            <button onClick={() => setDeleteCatId(cat.id)} className="text-[#888] hover:text-[#DC2626]"><Trash2 className="w-3 h-3" /></button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* General Tab */}
      {activeTab === 'app' && (
        <Card>
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">General Settings</h3>
          <div className="space-y-5 max-w-md">
            <Input label="Cash Opening Balance (₹)" type="number" value={settings.cash_opening_balance.toString()}
              onChange={e => updateAppSettings({ cash_opening_balance: Number(e.target.value) })} />

            <div>
              <label className="text-xs font-medium text-[#555] uppercase tracking-wide block mb-1">Cash Holder</label>
              <select value={CASH_HOLDERS.includes(settings.cash_holder) ? settings.cash_holder : 'Other'}
                onChange={e => {
                  if (e.target.value !== 'Other') updateAppSettings({ cash_holder: e.target.value, cash_holder_custom: undefined });
                  else updateAppSettings({ cash_holder: 'Other' });
                }}
                className="w-full px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA] mb-2">
                {CASH_HOLDERS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              {(settings.cash_holder === 'Other' || !CASH_HOLDERS.includes(settings.cash_holder)) && (
                <Input placeholder="Enter name of cash holder" value={settings.cash_holder_custom || (CASH_HOLDERS.includes(settings.cash_holder) ? '' : settings.cash_holder)}
                  onChange={e => updateAppSettings({ cash_holder: e.target.value, cash_holder_custom: e.target.value })} />
              )}
              <p className="text-xs text-[#888] mt-1">Person who currently holds the petty cash box</p>
            </div>

            <div>
              <p className="text-xs font-medium text-[#555] uppercase tracking-wide mb-2">Founder Salaries (for margin calc)</p>
              {(settings.founder_salaries || []).map((fs, i) => (
                <div key={fs.name} className="flex items-center gap-3 mb-2">
                  <span className="text-sm text-[#555] w-20">{fs.name}</span>
                  <input type="number" value={fs.monthly_amount || ''} placeholder="Monthly (₹)"
                    onChange={e => {
                      const updated = (settings.founder_salaries || []).map((x, j) => j === i ? { ...x, monthly_amount: Number(e.target.value) } : x);
                      updateAppSettings({ founder_salaries: updated });
                    }}
                    className="flex-1 px-3 py-1.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                  <label className="flex items-center gap-1 text-xs text-[#888]">
                    <input type="checkbox" checked={fs.active}
                      onChange={e => {
                        const updated = (settings.founder_salaries || []).map((x, j) => j === i ? { ...x, active: e.target.checked } : x);
                        updateAppSettings({ founder_salaries: updated });
                      }} />
                    Active
                  </label>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Tax Config Tab */}
      {activeTab === 'tax' && (
        <Card>
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">Tax Configuration</h3>
          {taxSettings ? (
            <div className="grid grid-cols-2 gap-4 max-w-lg">
              <Select label="Business Structure" value={taxSettings.business_structure}
                onChange={e => setTaxSettings({ ...taxSettings, business_structure: e.target.value as typeof taxSettings.business_structure })}
                options={[{ value: 'sole_proprietorship', label: 'Sole Proprietorship' }, { value: 'partnership', label: 'Partnership' }, { value: 'llp', label: 'LLP' }, { value: 'pvt_ltd', label: 'Pvt Ltd' }]} />
              <Input label="GSTIN" value={taxSettings.gstin} onChange={e => setTaxSettings({ ...taxSettings, gstin: e.target.value })} />
              <Input label="PAN" value={taxSettings.pan} onChange={e => setTaxSettings({ ...taxSettings, pan: e.target.value })} />
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
            <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-3">Export Backup</h3>
            <div className="max-w-sm space-y-3">
              <Input label="Backup Password" type="password" value={backupPassword} onChange={e => setBackupPassword(e.target.value)} placeholder="Set a strong password" />
              <Button variant="primary" icon={<Download className="w-4 h-4" />} onClick={handleExportBackup} loading={loading} disabled={!backupPassword}>
                Download Encrypted Backup (.rfb)
              </Button>
            </div>
          </Card>
          <Card>
            <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-3">Restore from Backup</h3>
            <div className="bg-[#fef3c7] border border-[#F59E0B] px-3 py-2 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#d97706]" />
              <p className="text-xs text-[#92400e]">Restoring overwrites all current data.</p>
            </div>
            <div className="space-y-3 max-w-sm">
              <Input label="Backup Password" type="password" value={restorePassword} onChange={e => setRestorePassword(e.target.value)} placeholder="Enter backup password" />
              <label className="block cursor-pointer">
                <span className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#070707] text-white hover:bg-[#1a1a1a]">
                  <Upload className="w-4 h-4" />Choose Backup File (.rfb)
                </span>
                <input type="file" accept=".rfb" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImportBackup(f); }} />
              </label>
            </div>
          </Card>
          <Card>
            <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#DC2626] mb-3">Danger Zone</h3>
            <p className="text-sm text-[#555] mb-3">Permanently delete all data. Backup first.</p>
            <Button variant="danger" onClick={() => setClearConfirm(true)}>Clear All Data</Button>
          </Card>
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === 'audit' && (
        <Card padding="none">
          <div className="px-5 py-4 border-b border-[#e8e8e8]">
            <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555]">
              <Eye className="w-4 h-4 inline mr-2" />Audit Log ({auditLog.length} events)
            </h3>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {auditLog.length === 0 ? (
              <p className="text-sm text-[#888] p-5">No audit events yet.</p>
            ) : auditLog.map(entry => (
              <div key={entry.id} className="flex items-start gap-4 px-5 py-3 border-b border-[#f5f5f5] last:border-0">
                <span className="text-xs text-[#888] flex-shrink-0 w-36 mt-0.5">
                  {new Date(entry.timestamp).toLocaleDateString('en-IN')} {new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div>
                  <span className="text-xs font-medium text-[#070707]">{entry.action}</span>
                  <span className="text-xs text-[#888] ml-2">{entry.entity}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <ConfirmModal open={!!deleteCatId} onClose={() => setDeleteCatId(null)}
        onConfirm={() => { if (deleteCatId) { deleteCategory(deleteCatId); toast('Category deleted', 'info'); setDeleteCatId(null); } }}
        title="Delete Category" message="Delete this category? Existing transactions won't be affected." />
      <ConfirmModal open={clearConfirm} onClose={() => setClearConfirm(false)} onConfirm={handleClearData}
        title="Clear All Data" message="This permanently deletes EVERYTHING. No undo. Make sure you have a backup."
        confirmLabel="Delete Everything" variant="danger" />
    </div>
  );
}
