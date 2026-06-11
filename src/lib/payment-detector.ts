/**
 * Real-time Payment & Expense Detector
 *
 * Detects two scenarios:
 * 1. Cash In / Bank Credit → likely a client payment received
 * 2. Cash Out / Bank Debit to a known vendor → likely a shared client expense
 */

import { getClients } from '@/lib/storage';

export interface PaymentSuggestion {
  client_id: string;
  client_name: string;
  suggested_amount: number;
  suggested_month: string;
  confidence: 'high' | 'medium';
  match_reason: string;
  direction: 'in' | 'out';
}

export function detectClientPayment(
  party: string,
  description: string,
  narration: string,
  amount: number,
  date: string,
  direction: 'in' | 'out' = 'in',
): PaymentSuggestion | null {
  const clients = getClients().filter(c => c.status === 'active');
  const searchText = `${party} ${description} ${narration}`.toLowerCase();
  const txnMonth = date.slice(0, 7);

  for (const client of clients) {
    const nameParts = client.name.toLowerCase().split(/\s+/);
    const significantParts = nameParts.filter(p => p.length >= 3);
    const matchedPart = significantParts.find(part => searchText.includes(part));
    if (!matchedPart) continue;

    const retainer = client.retainer_amount;
    const isExactRetainer = Math.abs(amount - retainer) < 50;
    const isCloseToRetainer = retainer > 0 && Math.abs(amount - retainer) / retainer < 0.15;

    let confidence: 'high' | 'medium' = 'medium';
    let match_reason = `"${matchedPart}" matches client name`;

    if (isExactRetainer) {
      confidence = 'high';
      match_reason = `Exact retainer amount (₹${retainer.toLocaleString('en-IN')}) — ${client.name}`;
    } else if (isCloseToRetainer) {
      confidence = 'high';
      match_reason = `Amount close to ${client.name}'s retainer (₹${retainer.toLocaleString('en-IN')})`;
    }

    return {
      client_id: client.id,
      client_name: client.name,
      suggested_amount: amount,
      suggested_month: txnMonth,
      confidence,
      match_reason,
      direction,
    };
  }

  return null;
}

/**
 * For vendor payments (debit transactions) — check if a known
 * vendor/freelancer name appears and suggest multi-client allocation.
 * Returns a generic "shared expense" suggestion when amount > threshold.
 */
export function detectSharedExpense(
  party: string,
  description: string,
  narration: string,
  amount: number,
  date: string,
): PaymentSuggestion | null {
  if (amount < 1000) return null; // don't bother for very small amounts

  // Check if the narration or party mentions multiple clients or known shared expense keywords
  const searchText = `${party} ${description} ${narration}`.toLowerCase();
  const sharedKeywords = ['shoot', 'video', 'photo', 'edit', 'production', 'studio', 'reel', 'content'];
  const isSharedExpense = sharedKeywords.some(kw => searchText.includes(kw));

  if (!isSharedExpense) return null;

  // Return a dummy suggestion with the first active client — the dialog lets them change it
  const clients = getClients().filter(c => c.status === 'active');
  if (clients.length === 0) return null;

  return {
    client_id: clients[0].id,
    client_name: clients[0].name,
    suggested_amount: amount,
    suggested_month: date.slice(0, 7),
    confidence: 'medium',
    match_reason: `Looks like a shared production expense — allocate across clients`,
    direction: 'out',
  };
}
