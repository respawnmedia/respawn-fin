/**
 * Simple payment records — separate from invoices.
 * "On this date, this client paid this amount via this mode."
 */

export interface PaymentRecord {
  id: string;
  client_id: string;
  date: string;
  amount: number;
  mode: 'UPI' | 'Bank Transfer' | 'Cash' | 'Cheque';
  for_month: string;     // which month's service this covers (YYYY-MM)
  notes?: string;
  created_at: string;
}

const KEY = 'rf:payment_records';

function read(): PaymentRecord[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}
function write(data: PaymentRecord[]): void {
  localStorage.setItem(KEY, JSON.stringify(data));
  // Supabase sync is handled automatically via the hybrid storage layer
  // (payment_records will be synced once we add it to the KEYS map)
}

export function getPaymentRecords(): PaymentRecord[] { return read(); }
export function getPaymentsByClient(clientId: string): PaymentRecord[] {
  return read().filter(p => p.client_id === clientId).sort((a, b) => b.date.localeCompare(a.date));
}
export function addPaymentRecord(p: Omit<PaymentRecord, 'id' | 'created_at'>): PaymentRecord {
  const n: PaymentRecord = { ...p, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  write([n, ...read()]); return n;
}
export function deletePaymentRecord(id: string): void {
  write(read().filter(p => p.id !== id));
}
export function getTotalPaidByClient(clientId: string, month?: string): number {
  return getPaymentsByClient(clientId)
    .filter(p => !month || p.for_month === month)
    .reduce((s, p) => s + p.amount, 0);
}
