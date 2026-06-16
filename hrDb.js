// src/lib/hrDb.js
// HR & Payroll data layer — Phase 2: Supabase (hq_data) backend
// All business logic (payroll, cycles, attendance) unchanged from Phase 1.
// Only the hrRead/hrWrite backend is replaced.

import { hqRead, hqWrite } from './supabase.js';

// ─── Low-level helpers ───────────────────────────────────────────────────────

async function hrRead(key, fallback = []) {
  return await hqRead(`hr_${key}`, fallback);
}

async function hrWrite(key, value) {
  await hqWrite(`hr_${key}`, value);
}

const genId = () => 'hr' + Date.now() + Math.random().toString(36).slice(2, 7);

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD in LOCAL time (avoids UTC timezone shift for Chennai UTC+5:30) */
export function toLocalDateStr(d) {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** All dates between start and end (inclusive), as YYYY-MM-DD strings in local time */
export function getDatesInRange(start, end) {
  const dates = [];
  const cur   = new Date(start + 'T00:00:00');
  const endD  = new Date(end   + 'T00:00:00');
  while (cur <= endD) {
    dates.push(toLocalDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Payroll cycle: 5th of previous month → 4th of current month */
export function getCurrentPayrollCycle() {
  const now = new Date();
  const cs  = new Date(now);
  const ce  = new Date(now);
  if (now.getDate() >= 5) {
    cs.setDate(5);
    ce.setMonth(ce.getMonth() + 1);
    ce.setDate(4);
  } else {
    cs.setMonth(cs.getMonth() - 1);
    cs.setDate(5);
    ce.setDate(4);
  }
  const startStr = toLocalDateStr(cs);
  const endStr   = toLocalDateStr(ce);
  const label    = `${cs.getDate()} ${cs.toLocaleString('en-IN', { month: 'short' })} – ${ce.getDate()} ${ce.toLocaleString('en-IN', { month: 'short', year: 'numeric' })}`;
  return { start: startStr, end: endStr, label };
}

/** Working days in a cycle: Mon–Fri = 1, Sat = 0.5, Sun/Holiday = 0 */
export function getWorkingDaysInCycle(start, end, holidays = []) {
  return getDatesInRange(start, end).reduce((total, d) => {
    const day = new Date(d + 'T00:00:00').getDay();
    if (day === 0 || holidays.some(h => h.date === d)) return total;
    if (day === 6) return total + 0.5;
    return total + 1;
  }, 0);
}

// ─── EMPLOYEES ───────────────────────────────────────────────────────────────

export async function getEmployees() {
  return await hrRead('employees', []);
}

export async function saveEmployee(data) {
  const emps = await hrRead('employees', []);
  const emp  = { ...data, updated_at: new Date().toISOString() };
  if (!emp.id) emp.id = genId();
  if (!emp.created_at) emp.created_at = new Date().toISOString();
  const idx = emps.findIndex(e => e.id === emp.id);
  let updated;
  if (idx >= 0) { updated = [...emps]; updated[idx] = emp; }
  else          { updated = [...emps, emp]; }
  await hrWrite('employees', updated);
  return emp;
}

export async function deactivateEmployee(id) {
  const emps = await hrRead('employees', []);
  await hrWrite('employees', emps.map(e => e.id === id ? { ...e, status: 'inactive', updated_at: new Date().toISOString() } : e));
}

// ─── ATTENDANCE ──────────────────────────────────────────────────────────────

export async function getAttendance(employeeId = null, startDate = null, endDate = null) {
  let recs = await hrRead('attendance', []);
  if (employeeId) recs = recs.filter(r => r.employee_id === employeeId);
  if (startDate)  recs = recs.filter(r => r.date >= startDate);
  if (endDate)    recs = recs.filter(r => r.date <= endDate);
  return recs;
}

export async function saveAttendance(record) {
  const recs = await hrRead('attendance', []);
  const idx  = recs.findIndex(r => r.id === record.id);
  let updated;
  if (idx >= 0) { updated = [...recs]; updated[idx] = record; }
  else          { updated = [record, ...recs]; }
  await hrWrite('attendance', updated);
  return record;
}

async function getTodayAttendance(employeeId) {
  const today = toLocalDateStr(new Date());
  const recs  = await hrRead('attendance', []);
  return recs.find(r => r.employee_id === employeeId && r.date === today) || null;
}

export async function checkIn(employeeId, employeeName, isHalfDay = false) {
  const today   = toLocalDateStr(new Date());
  const existing = await getTodayAttendance(employeeId);
  if (existing) return { error: 'Already checked in today' };

  const dow       = new Date(today + 'T00:00:00').getDay();
  const autoHalf  = dow === 6; // Saturday auto half-day

  const record = {
    id:             genId(),
    employee_id:    employeeId,
    employee_name:  employeeName,
    date:           today,
    checked_in:     true,
    check_in_time:  new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    status:         (isHalfDay || autoHalf) ? 'half_day' : 'present',
    marked_by:      'self',
    audit_log:      [{ action: 'check_in', by: 'employee', name: employeeName, at: new Date().toISOString() }],
    created_at:     new Date().toISOString(),
  };
  return await saveAttendance(record);
}

export async function adminOverrideAttendance(existingRecord, updates, adminName) {
  const auditEntry = {
    action:  'admin_override',
    by:      'admin',
    name:    adminName,
    at:      new Date().toISOString(),
    changed: updates,
  };
  const updated = {
    ...existingRecord,
    ...updates,
    marked_by: 'admin',
    audit_log: [...(existingRecord.audit_log || []), auditEntry],
  };
  return await saveAttendance(updated);
}

// ─── LEAVE REQUESTS ──────────────────────────────────────────────────────────

export async function getLeaveRequests(employeeId = null) {
  let reqs = await hrRead('leave_requests', []);
  if (employeeId) reqs = reqs.filter(r => r.employee_id === employeeId);
  return reqs;
}

export async function submitLeaveRequest(req) {
  const reqs   = await hrRead('leave_requests', []);
  const record = { ...req, id: req.id || genId(), status: 'pending', created_at: req.created_at || new Date().toISOString() };
  await hrWrite('leave_requests', [record, ...reqs]);
  return record;
}

export async function updateLeaveRequest(id, updates) {
  const reqs = await hrRead('leave_requests', []);
  await hrWrite('leave_requests', reqs.map(r => r.id === id ? { ...r, ...updates } : r));
}

// ─── HOLIDAYS ────────────────────────────────────────────────────────────────

export async function getHolidays() {
  return await hrRead('holidays', []);
}

export async function addHoliday(holiday) {
  const hols   = await hrRead('holidays', []);
  const record = { ...holiday, id: holiday.id || genId(), created_at: new Date().toISOString() };
  await hrWrite('holidays', [...hols, record]);
  return record;
}

export async function removeHoliday(id) {
  const hols = await hrRead('holidays', []);
  await hrWrite('holidays', hols.filter(h => h.id !== id));
}

// ─── ONBOARDING ──────────────────────────────────────────────────────────────

export async function getOnboarding() {
  return await hrRead('onboarding', []);
}

export async function saveOnboarding(data) {
  const list   = await hrRead('onboarding', []);
  const record = { ...data, id: data.id || genId(), submitted_at: data.submitted_at || new Date().toISOString(), status: data.status || 'pending' };
  const idx    = list.findIndex(o => o.id === record.id);
  let updated;
  if (idx >= 0) { updated = [...list]; updated[idx] = record; }
  else          { updated = [...list, record]; }
  await hrWrite('onboarding', updated);
  return record;
}

export async function updateOnboarding(id, updates) {
  const list = await hrRead('onboarding', []);
  await hrWrite('onboarding', list.map(o => o.id === id ? { ...o, ...updates } : o));
}

// ─── PAYROLL CALCULATION ─────────────────────────────────────────────────────

export async function calculatePayroll(employee, cycle, holidays = []) {
  const attendance    = await getAttendance(employee.id, cycle.start, cycle.end);
  const leaveRequests = await getLeaveRequests(employee.id);
  const approvedLeaves = leaveRequests.filter(l => l.status === 'approved');

  const allDates = getDatesInRange(cycle.start, cycle.end);
  const today    = new Date(); today.setHours(0, 0, 0, 0);

  // Build approved leave date → leave_type map
  const leaveDates = new Map();
  approvedLeaves.forEach(l => {
    getDatesInRange(l.from_date || l.startDate, l.to_date || l.endDate)
      .forEach(d => leaveDates.set(d, l.leave_type || l.leaveType));
  });

  // Working days in cycle (Mon–Fri=1, Sat=0.5, Sun/Holiday=0)
  let workingDays = 0;
  allDates.forEach(d => {
    const day = new Date(d + 'T00:00:00').getDay();
    if (day === 0 || holidays.some(h => h.date === d)) return;
    workingDays += (day === 6) ? 0.5 : 1;
  });

  const perDayRate = employee.monthly_salary / workingDays;
  const leaveQuota = employee.leaves_per_month ?? 2; // combined CL+SL+HD per month

  let presentDays   = 0;
  let absentDays    = 0;
  let halfDays      = 0;
  let leavesUsed    = 0;
  let deductionDays = 0;

  allDates.forEach(date => {
    const d   = new Date(date + 'T00:00:00');
    if (d > today) return;
    const dow = d.getDay();
    if (dow === 0 || holidays.some(h => h.date === date)) return;

    const isSat    = dow === 6;
    const rec      = attendance.find(a => a.date === date);
    const leaveTyp = leaveDates.get(date);

    if (leaveTyp) {
      // Approved leave
      leavesUsed += (rec?.status === 'half_day') ? 0.5 : 1;
    } else if (rec) {
      if (rec.status === 'present')  { presentDays   += isSat ? 0.5 : 1; }
      if (rec.status === 'half_day') { halfDays++;  leavesUsed += 0.5; presentDays += 0.5; }
      if (rec.status === 'absent')   { absentDays   += isSat ? 0.5 : 1; deductionDays += isSat ? 0.5 : 1; }
      if (rec.status === 'leave')    { leavesUsed   += 1; }
    } else {
      // No record — default present
      presentDays += isSat ? 0.5 : 1;
    }
  });

  const excessLeaves    = Math.max(0, leavesUsed - leaveQuota);
  const totalDeductible = deductionDays + excessLeaves;
  const deduction       = Math.round(totalDeductible * perDayRate);
  const finalSalary     = Math.max(0, employee.monthly_salary - deduction);

  return {
    employeeId:      employee.id,
    employeeName:    employee.name,
    baseSalary:      employee.monthly_salary,
    workingDays:     Math.round(workingDays * 10) / 10,
    perDayRate:      Math.round(perDayRate),
    presentDays:     Math.round(presentDays * 10) / 10,
    absentDays:      Math.round(absentDays * 10) / 10,
    halfDays,
    leavesUsed:      Math.round(leavesUsed * 10) / 10,
    leaveQuota,
    excessLeaves:    Math.round(excessLeaves * 10) / 10,
    totalDeductible: Math.round(totalDeductible * 10) / 10,
    deduction,
    finalSalary,
    cycle,
  };
}
