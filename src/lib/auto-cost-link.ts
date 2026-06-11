/**
 * Auto Cost Sheet Linker
 *
 * When a transaction is tagged with a client_id, this module
 * automatically creates or updates a cost sheet line item for that
 * client's monthly cost sheet, keeping costs in sync with real transactions.
 *
 * Called after any bank/cash transaction is saved with a client_id.
 */

import {
  getClientMonthlyCosts, upsertClientMonthlyCost,
  getClients, getCategories,
} from '@/lib/storage';
import type { BankTransaction, CashTransaction } from '@/types';

export function autoLinkToCosting(
  txn: (BankTransaction | CashTransaction) & { client_id?: string },
  txnType: 'bank' | 'cash'
): void {
  if (!txn.client_id) return;

  const amount = txnType === 'bank'
    ? (txn as BankTransaction).debit
    : (txn as CashTransaction).type === 'Cash Out' ? (txn as CashTransaction).amount : 0;

  if (amount <= 0) return; // Only link expenses

  const month = txn.date.slice(0, 7);
  const client = getClients().find(c => c.id === txn.client_id);
  if (!client) return;

  const category = getCategories().find(c => c.id === txn.category_id);
  const narration = txnType === 'bank'
    ? (txn as BankTransaction).narration
    : (txn as CashTransaction).description || (txn as CashTransaction).party;

  // Generate a label from the transaction
  const label = txn.reason
    || (category ? `${category.name}: ${narration.slice(0, 30)}` : narration.slice(0, 40));

  // Get or create the cost sheet
  const existing = getClientMonthlyCosts().find(c => c.client_id === txn.client_id && c.month === month);

  const newLine = {
    id: txn.id,
    label,
    planned_amount: amount,
    actual_amount: amount,
    category_id: txn.category_id,
    transaction_ids: [txn.id],
  };

  if (existing) {
    // Check if this transaction is already linked
    const alreadyLinked = existing.line_items.some(l => l.transaction_ids.includes(txn.id));
    if (alreadyLinked) return;

    // Add as new line item
    const updatedLines = [...existing.line_items, newLine];
    upsertClientMonthlyCost({
      ...existing,
      line_items: updatedLines,
      total_cost: updatedLines.reduce((s, l) => s + l.actual_amount, 0),
    });
  } else {
    // Create new cost sheet with this first entry
    // Pre-fill from client's fixed_cost_items template
    const templateLines = (client.fixed_cost_items || []).map(item => ({
      id: item.id,
      label: item.label,
      planned_amount: item.estimated_amount,
      actual_amount: 0, // Will be filled as transactions come in
      category_id: item.category_id,
      transaction_ids: [] as string[],
    }));

    upsertClientMonthlyCost({
      client_id: txn.client_id,
      month,
      line_items: [...templateLines, newLine],
      total_cost: amount,
    });
  }
}
