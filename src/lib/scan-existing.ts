/**
 * Scan Existing Transactions
 *
 * Retroactively scans all bank credits and cash-ins to find
 * transactions that look like client payments but haven't been recorded
 * in the payment records system yet.
 */

import { getBankTransactions, getCashTransactions, getClients } from '@/lib/storage';
import { getPaymentRecords } from '@/lib/payments';
import { formatCurrency } from '@/utils/format';

export interface ScanResult {
  id: string;
  source: 'bank' | 'cash';
  date: string;
  amount: number;
  narration: string;
  client_id: string;
  client_name: string;
  match_reason: string;
  confidence: 'high' | 'medium';
  alreadyRecorded: boolean;
}

export function scanExistingForClientPayments(): ScanResult[] {
  const clients = getClients().filter(c => c.status === 'active');
  const bankTxns = getBankTransactions();
  const cashTxns = getCashTransactions();
  const existingPayments = getPaymentRecords();
  const results: ScanResult[] = [];

  // Build a set of "already matched" transaction signatures to avoid duplicates
  // We consider a payment recorded if there's a record for the same client + date + amount (±50)
  function isAlreadyRecorded(clientId: string, date: string, amount: number): boolean {
    return existingPayments.some(p =>
      p.client_id === clientId &&
      Math.abs(p.amount - amount) < 50 &&
      p.date === date
    );
  }

  // Scan bank credits
  bankTxns.filter(t => t.credit > 0).forEach(txn => {
    const searchText = txn.narration.toLowerCase();
    for (const client of clients) {
      const nameParts = client.name.toLowerCase().split(/\s+/).filter(p => p.length >= 3);
      const matched = nameParts.find(part => searchText.includes(part));
      if (!matched) continue;

      const isExactRetainer = Math.abs(txn.credit - client.retainer_amount) < 50;
      const isClose = client.retainer_amount > 0 && Math.abs(txn.credit - client.retainer_amount) / client.retainer_amount < 0.15;
      const recorded = isAlreadyRecorded(client.id, txn.date, txn.credit);

      results.push({
        id: txn.id,
        source: 'bank',
        date: txn.date,
        amount: txn.credit,
        narration: txn.narration,
        client_id: client.id,
        client_name: client.name,
        match_reason: isExactRetainer
          ? `Exact retainer match (${formatCurrency(client.retainer_amount)})`
          : isClose
            ? `Close to retainer (${formatCurrency(client.retainer_amount)})`
            : `"${matched}" in narration`,
        confidence: isExactRetainer || isClose ? 'high' : 'medium',
        alreadyRecorded: recorded,
      });
      break; // one client match per transaction
    }
  });

  // Scan cash-ins
  cashTxns.filter(t => t.type === 'Cash In').forEach(txn => {
    const searchText = `${txn.party} ${txn.description} ${txn.reason || ''}`.toLowerCase();
    for (const client of clients) {
      const nameParts = client.name.toLowerCase().split(/\s+/).filter(p => p.length >= 3);
      const matched = nameParts.find(part => searchText.includes(part));
      if (!matched) continue;

      const isExactRetainer = Math.abs(txn.amount - client.retainer_amount) < 50;
      const isClose = client.retainer_amount > 0 && Math.abs(txn.amount - client.retainer_amount) / client.retainer_amount < 0.15;
      const recorded = isAlreadyRecorded(client.id, txn.date, txn.amount);

      results.push({
        id: txn.id,
        source: 'cash',
        date: txn.date,
        amount: txn.amount,
        narration: `${txn.party}: ${txn.description}`,
        client_id: client.id,
        client_name: client.name,
        match_reason: isExactRetainer
          ? `Exact retainer match (${formatCurrency(client.retainer_amount)})`
          : isClose
            ? `Close to retainer (${formatCurrency(client.retainer_amount)})`
            : `"${matched}" in party/description`,
        confidence: isExactRetainer || isClose ? 'high' : 'medium',
        alreadyRecorded: recorded,
      });
      break;
    }
  });

  // Sort: unrecorded first, then by date descending
  return results.sort((a, b) => {
    if (a.alreadyRecorded !== b.alreadyRecorded) return a.alreadyRecorded ? 1 : -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

export function markScanned(results: ScanResult[]): void {
  // This is a no-op — the actual recording happens when the user confirms each result
  // via addPaymentRecord in the UI
}
