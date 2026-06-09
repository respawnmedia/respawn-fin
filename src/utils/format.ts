/**
 * Format a number as Indian currency (₹1,25,000)
 */
export function formatCurrency(amount: number, compact = false): string {
  if (compact) {
    if (Math.abs(amount) >= 1_00_00_000) {
      return `₹${(amount / 1_00_00_000).toFixed(2)}Cr`;
    }
    if (Math.abs(amount) >= 1_00_000) {
      return `₹${(amount / 1_00_000).toFixed(2)}L`;
    }
    if (Math.abs(amount) >= 1_000) {
      return `₹${(amount / 1_000).toFixed(1)}K`;
    }
  }
  // Indian numbering: first comma after 3 digits from right, then every 2
  const isNeg = amount < 0;
  const abs = Math.abs(Math.round(amount));
  const str = abs.toString();
  let result = '';
  if (str.length <= 3) {
    result = str;
  } else {
    const last3 = str.slice(-3);
    const rest = str.slice(0, -3);
    const groups: string[] = [];
    for (let i = rest.length; i > 0; i -= 2) {
      groups.unshift(rest.slice(Math.max(0, i - 2), i));
    }
    result = groups.join(',') + ',' + last3;
  }
  return `${isNeg ? '-' : ''}₹${result}`;
}

/**
 * Format a date string as DD MMM YYYY
 */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Format month string YYYY-MM as "Apr 2025"
 */
export function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

/**
 * Get current month as YYYY-MM
 */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Get YYYY-MM for N months ago
 */
export function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 7);
}

/**
 * Format a number with +/- prefix
 */
export function formatDelta(amount: number): string {
  const sign = amount >= 0 ? '+' : '';
  return `${sign}${formatCurrency(amount)}`;
}

/**
 * Returns 'inflow', 'outflow', or 'neutral' CSS class based on amount
 */
export function flowClass(amount: number): string {
  if (amount > 0) return 'text-green-600';
  if (amount < 0) return 'text-red-600';
  return 'text-gray-500';
}

/**
 * Generate a sequential invoice number
 */
export function generateInvoiceNo(existingInvoices: { invoice_no: string }[]): string {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const existing = existingInvoices
    .map(i => parseInt(i.invoice_no.split('-').pop() || '0'))
    .filter(n => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `RM-${year}${month}-${String(next).padStart(3, '0')}`;
}
