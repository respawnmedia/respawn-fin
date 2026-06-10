import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, Users, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Card, MetricCard } from '@/components/ui/Card';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { getTeamMembers, addTeamMember, updateTeamMember, deleteTeamMember, getClients, getBankTransactions, getCashTransactions, getCategories, addAuditEntry } from '@/lib/storage';
import { formatCurrency, monthsAgo } from '@/utils/format';
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
    is_variable_cost: false,
  };
  const [form, setForm] = useState(emptyForm);

  const members = getTeamMembers();
  const clients = getClients();
  const categories = getCategories();
  const bankTxns = getBankTransactions();
  const cashTxns = getCashTransactions();
  const filtered = filterType ? members.filter(m => m.type === filterType) : members;

  // ── Compute 3-month average for variable-cost members ─────────────────────
  function computeAvgCost(member: TeamMember): { avg: number; months: { month: string; amount: number }[] } {
    const last3 = [0, 1, 2].map(i => monthsAgo(i));
    const freelanceCatIds = new Set(categories.filter(c => ['Freelancer Fees', 'Professional Fees', 'Vendor Payment'].includes(c.name)).map(c => c.id));
    const months = last3.map(month => {
      const nameLower = member.name.toLowerCase();
      const bankPaid = bankTxns.filter(t =>
        t.date.startsWith(month) &&
        t.debit > 0 &&
        (t.narration.toLowerCase().includes(nameLower) || (t.notes && t.notes.toLowerCase().includes(nameLower)))
      ).reduce((s, t) => s + t.debit, 0);
      const cashPaid = cashTxns.filter(t =>
        t.date.startsWith(month) &&
        t.type === 'Cash Out' &&
        (t.party.toLowerCase().includes(nameLower) || t.description.toLowerCase().includes(nameLower))
      ).reduce((s, t) => s + t.amount, 0);
      return { month, amount: bankPaid + cashPaid };
    });
    const total = months.reduce((s, m) => s + m.amount, 0);
    const avg = total / 3;
    return { avg, months };
  }

  const metrics = useMemo(() => {
    const active = members.filter(m => m.active);
    const totalMonthlyCost = active.reduce((s, m) => s + m.monthly_cost, 0);
    return {
      totalMonthlyCost,
      employees: active.filter(m => m.type === 'employee').length,
      freelancers: active.filter(m => m.type === 'freelancer').length,
      vendors: active.filter(m => m.type === 'vendor').length,
    };
  }, [members]);

  const clientCostBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    members.filter(m => m.active).forEach(m => {
      m.client_allocations.forEach(a => {
        breakdown[a.client_id] = (breakdown[a.client_id] || 0) + (m.monthly_cost * a.percentage / 100);
      });
    });
    return breakdown;
  }, [members]);

  function openAdd() { setForm(emptyForm); setEditing(null); setModal(true); }
  function openEdit(m: TeamMember) {
    setForm({
      name: m.name, type: m.type, role: m.role,
      monthly_cost: m.monthly_cost.toString(),
      skills: m.skills.join(', '),
      contact: m.contact || '', active: m.active,
      joined_date: m.joined_date, notes: m.notes || '',
      client_allocations: m.client_allocations,
      is_variable_cost: (m as TeamMember & { is_variable_cost?: boolean }).is_variable_cost || false,
    });
    setEditing(m);
    setModal(true);
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
    toast(editing ? 'Updated' : 'Added', 'success');
    setModal(false);
  }

  const typeColor: Record<TeamMemberType, 'green' | 'blue' | 'amber'> = { employee: 'green', freelancer: 'blue', vendor: 'amber' };

  return (
    <div className="p-4 lg:p-6 max-w-[1100px]">
      <PageHeader
        title="Team & Vendors"
        subtitle="People costs, client allocation, 3-month averages for variable pay"
        actions={<Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAdd}>Add Member</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total Monthly Cost" value={formatCurrency(metrics.totalMonthlyCost, true)} accent="red" />
        <MetricCard label="Employees" value={String(metrics.employees)} icon={<Users className="w-4 h-4" />} />
        <MetricCard label="Freelancers" value={String(metrics.freelancers)} />
        <MetricCard label="Vendors" value={String(metrics.vendors)} />
      </div>

      {/* Client cost allocation summary */}
      {clients.length > 0 && Object.keys(clientCostBreakdown).length > 0 && (
        <Card className="mb-6">
          <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#555] mb-4">
            <TrendingUp className="w-4 h-4 inline mr-1" />Team Cost per Client (Monthly)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {clients.map(c => {
              const cost = clientCostBreakdown[c.id] || 0;
              if (!cost) return null;
              const margin = c.retainer_amount - cost;
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

      <div className="flex gap-2 mb-4">
        {(['', 'employee', 'freelancer', 'vendor'] as const).map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 text-xs transition-colors ${filterType === t ? 'bg-[#070707] text-white' : 'border border-[#ddd] text-[#555] hover:border-[#070707]'}`}>
            {t === '' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1) + 's'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[#888] text-sm mb-3">No team members yet.</p>
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAdd}>Add First Member</Button>
        </Card>
      ) : (
        <div className="border border-[#e8e8e8]">
          {filtered.map((m, i) => {
            const avgData = (m.type === 'freelancer' || m.type === 'vendor') ? computeAvgCost(m) : null;
            const totalPct = m.client_allocations.reduce((s, a) => s + a.percentage, 0);
            return (
              <div key={m.id} className={`flex items-start justify-between px-5 py-4 ${i > 0 ? 'border-t border-[#f0f0f0]' : ''} hover:bg-[#fafafa]`}>
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-9 h-9 bg-[#EFE9D9] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-[#555]">{m.name.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[#070707]">{m.name}</span>
                      <Badge variant={typeColor[m.type]}>{m.type}</Badge>
                      {!m.active && <Badge variant="gray">Inactive</Badge>}
                    </div>
                    <p className="text-xs text-[#888] mt-0.5">{m.role}</p>
                    {m.client_allocations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {m.client_allocations.map(a => {
                          const client = clients.find(c => c.id === a.client_id);
                          return client ? (
                            <span key={a.client_id} className="text-xs px-1.5 py-0.5 bg-[#f0f0f0] text-[#555]">
                              {client.name} {a.percentage}%
                            </span>
                          ) : null;
                        })}
                        {100 - totalPct > 0 && <span className="text-xs px-1.5 py-0.5 bg-[#f0f0f0] text-[#888]">Overhead {100 - totalPct}%</span>}
                      </div>
                    )}
                    {/* 3-month average for freelancers/vendors */}
                    {avgData && (
                      <div className="mt-2 flex items-center gap-3">
                        <span className="text-xs text-[#888]">3-mo avg from transactions:</span>
                        <span className="text-xs font-semibold text-[#16C4BA]">
                          {avgData.avg > 0 ? formatCurrency(avgData.avg, true) : 'No matches yet'}
                        </span>
                        {avgData.months.map(mo => mo.amount > 0 && (
                          <span key={mo.month} className="text-xs text-[#aaa]">{mo.month.slice(5)}: {formatCurrency(mo.amount, true)}</span>
                        ))}
                      </div>
                    )}
                    {m.skills.length > 0 && <p className="text-xs text-[#bbb] mt-1">{m.skills.join(' · ')}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-6 ml-4 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">{formatCurrency(m.monthly_cost)}</p>
                    <p className="text-xs text-[#888]">{m.type === 'employee' ? 'salary' : 'approx/mo'}</p>
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

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Member' : 'Add Team Member'} width="lg"
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button><Button variant="primary" onClick={save}>{editing ? 'Save' : 'Add Member'}</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            <Select label="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as TeamMemberType })} options={TYPE_OPTIONS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Role / Designation" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="e.g. Video Editor" />
            <div>
              <Input label={form.type === 'employee' ? 'Monthly Salary (₹)' : 'Approx Monthly Cost (₹)'} type="number" value={form.monthly_cost} onChange={e => setForm({ ...form, monthly_cost: e.target.value })} placeholder="Enter base amount" />
              {(form.type === 'freelancer' || form.type === 'vendor') && (
                <p className="text-xs text-[#888] mt-1">For variable-pay people, enter a baseline. The app will show the actual 3-month average from your bank/cash transactions automatically.</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Contact" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} />
            <Input label="Joined Date" type="date" value={form.joined_date} onChange={e => setForm({ ...form, joined_date: e.target.value })} />
          </div>
          <Input label="Skills (comma separated)" value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })} placeholder="Reels, Photography, Editing..." />

          {/* Client allocation picker */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-[#555] uppercase tracking-wide">Client Cost Allocation</p>
              {totalAllocated > 0 && (
                <span className={`text-xs font-medium ${totalAllocated > 100 ? 'text-[#DC2626]' : totalAllocated === 100 ? 'text-[#16A34A]' : 'text-[#888]'}`}>
                  {totalAllocated}% allocated · {Math.max(0, 100 - totalAllocated)}% overhead
                </span>
              )}
            </div>
            <p className="text-xs text-[#888] mb-3">Pick clients this person works on, then set % of their cost each client bears</p>
            <div className="space-y-1.5 mb-2">
              {form.client_allocations.length === 0
                ? <p className="text-xs text-[#aaa] italic py-1">No clients added yet.</p>
                : form.client_allocations.map(alloc => {
                  const client = clients.find(c => c.id === alloc.client_id);
                  if (!client) return null;
                  return (
                    <div key={alloc.client_id} className="flex items-center gap-2 bg-[#f7f7f5] px-3 py-1.5">
                      <span className="text-sm flex-1 truncate">{client.name}</span>
                      <input type="number" min="0" max="100" value={alloc.percentage || ''}
                        onChange={e => {
                          const pct = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                          setForm(f => ({ ...f, client_allocations: f.client_allocations.map(a => a.client_id === alloc.client_id ? { ...a, percentage: pct } : a) }));
                        }}
                        className="w-16 px-2 py-1 text-xs text-right border border-[#ddd] focus:outline-none focus:border-[#16C4BA]" />
                      <span className="text-xs text-[#888]">%</span>
                      <button type="button" onClick={() => setForm(f => ({ ...f, client_allocations: f.client_allocations.filter(a => a.client_id !== alloc.client_id) }))}
                        className="text-[#ccc] hover:text-[#DC2626]"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  );
                })}
            </div>
            <select value="" onChange={e => {
              if (e.target.value) setForm(f => ({ ...f, client_allocations: [...f.client_allocations, { client_id: e.target.value, percentage: 0 }] }));
            }} className="w-full px-3 py-2 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA]">
              <option value="">+ Add client to allocation...</option>
              {clients.filter(c => c.status === 'active' && !form.client_allocations.some(a => a.client_id === c.id))
                .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Textarea label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
            <div className="flex items-center mt-6">
              <label className="flex items-center gap-2 text-sm text-[#555] cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="w-4 h-4" />
                Currently active
              </label>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) { deleteTeamMember(deleteId); toast('Deleted', 'info'); setDeleteId(null); } }}
        title="Delete Member" message="Remove this team member?" />
    </div>
  );
}
