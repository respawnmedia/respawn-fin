import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Card, MetricCard } from '@/components/ui/Card';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { getTeamMembers, addTeamMember, updateTeamMember, deleteTeamMember, getClients, addAuditEntry } from '@/lib/storage';
import { formatCurrency } from '@/utils/format';
import type { TeamMember, TeamMemberType, TeamClientAllocation } from '@/types';

const TYPE_OPTIONS: { value: TeamMemberType; label: string }[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'vendor', label: 'Vendor / Agency' },
];

export function TeamMembersPage() {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('');

  const emptyForm = {
    name: '', type: 'employee' as TeamMemberType, role: '',
    monthly_cost: '', skills: '', contact: '', active: true,
    joined_date: new Date().toISOString().split('T')[0], notes: '',
    client_allocations: [] as TeamClientAllocation[],
  };
  const [form, setForm] = useState(emptyForm);

  const members = getTeamMembers();
  const clients = getClients();

  const filtered = filterType ? members.filter(m => m.type === filterType) : members;

  const metrics = useMemo(() => {
    const active = members.filter(m => m.active);
    const totalMonthlyCost = active.reduce((s, m) => s + m.monthly_cost, 0);
    const employees = active.filter(m => m.type === 'employee');
    const freelancers = active.filter(m => m.type === 'freelancer');
    const vendors = active.filter(m => m.type === 'vendor');
    return { totalMonthlyCost, employees: employees.length, freelancers: freelancers.length, vendors: vendors.length };
  }, [members]);

  // Client-wise cost allocation
  const clientCostBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    members.filter(m => m.active).forEach(m => {
      m.client_allocations.forEach(a => {
        breakdown[a.client_id] = (breakdown[a.client_id] || 0) + (m.monthly_cost * a.percentage / 100);
      });
    });
    return breakdown;
  }, [members]);

  function openAdd() {
    setForm(emptyForm);
    setEditing(null);
    setModal(true);
  }
  function openEdit(m: TeamMember) {
    setForm({
      name: m.name, type: m.type, role: m.role,
      monthly_cost: m.monthly_cost.toString(), skills: m.skills.join(', '),
      contact: m.contact || '', active: m.active,
      joined_date: m.joined_date, notes: m.notes || '',
      client_allocations: m.client_allocations,
    });
    setEditing(m);
    setModal(true);
  }

  function updateAllocation(clientId: string, pct: string) {
    const percentage = Math.max(0, Math.min(100, Number(pct) || 0));
    const existing = form.client_allocations.find(a => a.client_id === clientId);
    if (existing) {
      setForm(f => ({ ...f, client_allocations: f.client_allocations.map(a => a.client_id === clientId ? { ...a, percentage } : a) }));
    } else if (percentage > 0) {
      setForm(f => ({ ...f, client_allocations: [...f.client_allocations, { client_id: clientId, percentage }] }));
    }
  }

  const totalAllocated = form.client_allocations.reduce((s, a) => s + a.percentage, 0);

  async function save() {
    if (!form.name.trim()) return;
    const payload: Omit<TeamMember, 'id'> = {
      name: form.name.trim(), type: form.type, role: form.role.trim(),
      monthly_cost: Number(form.monthly_cost) || 0,
      skills: form.skills.split(',').map(s => s.trim()).filter(Boolean),
      contact: form.contact, active: form.active,
      joined_date: form.joined_date, notes: form.notes,
      client_allocations: form.client_allocations.filter(a => a.percentage > 0),
    };
    if (editing) {
      updateTeamMember(editing.id, payload);
      addAuditEntry({ user_id: 'founder', action: 'UPDATE_TEAM_MEMBER', entity: 'team_member', entity_id: editing.id });
    } else {
      const m = addTeamMember(payload);
      addAuditEntry({ user_id: 'founder', action: 'ADD_TEAM_MEMBER', entity: 'team_member', entity_id: m.id });
    }
    toast(editing ? 'Member updated' : 'Member added', 'success');
    setModal(false);
  }

  const typeColor: Record<TeamMemberType, 'green' | 'blue' | 'amber'> = { employee: 'green', freelancer: 'blue', vendor: 'amber' };

  return (
    <div className="p-4 lg:p-6 max-w-[1100px]">
      <PageHeader
        title="Team & Vendors"
        subtitle="Track people costs and how they map to clients"
        actions={<Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAdd}>Add Member</Button>}
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total Monthly Cost" value={formatCurrency(metrics.totalMonthlyCost, true)} accent="red" />
        <MetricCard label="Employees" value={String(metrics.employees)} icon={<Users className="w-4 h-4" />} />
        <MetricCard label="Freelancers" value={String(metrics.freelancers)} />
        <MetricCard label="Vendors" value={String(metrics.vendors)} />
      </div>

      {/* Client cost attribution */}
      {clients.length > 0 && Object.keys(clientCostBreakdown).length > 0 && (
        <Card className="mb-6">
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
            Team Cost per Client (Monthly)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {clients.map(c => {
              const cost = clientCostBreakdown[c.id] || 0;
              const margin = c.retainer_amount - cost;
              if (!cost) return null;
              return (
                <div key={c.id} className="p-3 bg-[#f7f7f5]">
                  <p className="text-xs font-medium text-[#555] mb-1">{c.name}</p>
                  <p className="text-sm font-bold text-[#DC2626]">{formatCurrency(cost, true)}</p>
                  <p className="text-xs text-[#888]">of {formatCurrency(c.retainer_amount, true)}</p>
                  <p className={`text-xs font-medium mt-1 ${margin >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                    {margin >= 0 ? '+' : ''}{formatCurrency(margin, true)} margin
                  </p>
                </div>
              );
            }).filter(Boolean)}
          </div>
        </Card>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(['', 'employee', 'freelancer', 'vendor'] as const).map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 text-xs transition-colors ${filterType === t ? 'bg-[#070707] text-white' : 'border border-[#ddd] text-[#555] hover:border-[#070707]'}`}>
            {t === '' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1) + 's'}
          </button>
        ))}
      </div>

      {/* Member list */}
      {filtered.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[#888] text-sm mb-3">No team members yet.</p>
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAdd}>Add First Member</Button>
        </Card>
      ) : (
        <div className="border border-[#e8e8e8]">
          {filtered.map((m, i) => {
            const totalPct = m.client_allocations.reduce((s, a) => s + a.percentage, 0);
            const overhead = 100 - totalPct;
            return (
              <div key={m.id} className={`flex items-center justify-between px-5 py-4 ${i > 0 ? 'border-t border-[#f0f0f0]' : ''} hover:bg-[#fafafa]`}>
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-9 h-9 bg-[#EFE9D9] flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-[#555]">{m.name.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#070707]">{m.name}</span>
                      <Badge variant={typeColor[m.type]}>{m.type}</Badge>
                      {!m.active && <Badge variant="gray">Inactive</Badge>}
                    </div>
                    <p className="text-xs text-[#888] mt-0.5">{m.role}</p>
                    {m.client_allocations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {m.client_allocations.map(a => {
                          const client = clients.find(c => c.id === a.client_id);
                          return client ? (
                            <span key={a.client_id} className="text-xs px-1.5 py-0.5 bg-[#f0f0f0] text-[#555]">
                              {client.name} {a.percentage}%
                            </span>
                          ) : null;
                        })}
                        {overhead > 0 && <span className="text-xs px-1.5 py-0.5 bg-[#f0f0f0] text-[#888]">Overhead {overhead}%</span>}
                      </div>
                    )}
                    {m.skills.length > 0 && <p className="text-xs text-[#aaa] mt-0.5">{m.skills.join(' · ')}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-6 ml-4 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">{formatCurrency(m.monthly_cost)}</p>
                    <p className="text-xs text-[#888]">/month</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(m)} className="text-[#888] hover:text-[#070707]"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDeleteId(m.id)} className="text-[#888] hover:text-[#DC2626]"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Member' : 'Add Team Member'} width="lg"
        footer={<>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={save}>{editing ? 'Save' : 'Add Member'}</Button>
        </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            <Select label="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as TeamMemberType })} options={TYPE_OPTIONS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Role / Designation" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="e.g. Video Editor, Photographer" />
            <Input label="Monthly Cost (₹)" type="number" value={form.monthly_cost} onChange={e => setForm({ ...form, monthly_cost: e.target.value })} placeholder="Salary or avg spend" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Contact" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="Phone or email" />
            <Input label="Joined Date" type="date" value={form.joined_date} onChange={e => setForm({ ...form, joined_date: e.target.value })} />
          </div>
          <Input label="Skills (comma separated)" value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })} placeholder="Video editing, Reels, Photography..." />

          {/* Client allocations */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-[#555] uppercase tracking-wide">Client Cost Allocation</p>
              {totalAllocated > 0 && (
                <span className={`text-xs font-medium ${totalAllocated > 100 ? 'text-[#DC2626]' : totalAllocated === 100 ? 'text-[#16A34A]' : 'text-[#888]'}`}>
                  {totalAllocated}% allocated · {Math.max(0, 100 - totalAllocated)}% overhead
                </span>
              )}
            </div>
            <p className="text-xs text-[#888] mb-3">Pick the clients this person works on, then set time %</p>

            {/* Selected clients with % input */}
            <div className="space-y-1.5 mb-2">
              {form.client_allocations.length === 0 ? (
                <p className="text-xs text-[#aaa] italic py-2">No clients added yet. Pick from the dropdown below.</p>
              ) : (
                form.client_allocations.map(alloc => {
                  const client = clients.find(c => c.id === alloc.client_id);
                  if (!client) return null;
                  return (
                    <div key={alloc.client_id} className="flex items-center gap-2 bg-[#f7f7f5] px-3 py-1.5">
                      <span className="text-sm text-[#070707] flex-1 truncate">{client.name}</span>
                      <input type="number" min="0" max="100"
                        value={alloc.percentage || ''}
                        onChange={e => updateAllocation(alloc.client_id, e.target.value)}
                        placeholder="0"
                        className="w-16 px-2 py-1 text-xs text-right border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                      <span className="text-xs text-[#888]">%</span>
                      <button type="button" onClick={() => setForm(f => ({ ...f, client_allocations: f.client_allocations.filter(a => a.client_id !== alloc.client_id) }))}
                        className="text-[#ccc] hover:text-[#DC2626]"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Picker for adding clients */}
            <select value="" onChange={e => {
              if (e.target.value) {
                setForm(f => ({ ...f, client_allocations: [...f.client_allocations, { client_id: e.target.value, percentage: 0 }] }));
              }
            }}
              className="w-full px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
              <option value="">+ Add client to allocation...</option>
              {clients
                .filter(c => c.status === 'active' && !form.client_allocations.some(a => a.client_id === c.id))
                .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
              }
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Textarea label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
            <div>
              <label className="flex items-center gap-2 text-xs text-[#555] mt-5">
                <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
                Currently active
              </label>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) { deleteTeamMember(deleteId); toast('Member deleted', 'info'); setDeleteId(null); } }}
        title="Delete Member" message="Remove this team member?" />
    </div>
  );
}
