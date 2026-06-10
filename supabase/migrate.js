/**
 * Respawn Finance — localStorage → Supabase Migration Script
 *
 * Run this in the browser console while on your deployed Respawn Finance app,
 * BEFORE switching storage.ts to the Supabase version. This will copy all your
 * existing data into Supabase.
 *
 * Usage:
 * 1. Open the deployed app in your browser
 * 2. Open DevTools (F12) → Console tab
 * 3. Paste this ENTIRE file and press Enter
 * 4. It will prompt for your Supabase URL and anon key
 * 5. Wait for "Migration complete!"
 * 6. THEN switch storage.ts and redeploy
 */

(async function migrate() {
  const supabaseUrl = prompt('Supabase URL (e.g. https://xxxxx.supabase.co):');
  const supabaseKey = prompt('Supabase anon key (long eyJ... string):');
  if (!supabaseUrl || !supabaseKey) { alert('Both URL and key are required'); return; }

  const headers = { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

  // Map localStorage keys → Supabase tables
  const mapping = [
    { lsKey: 'rf:audit_log', table: 'audit_log' },
    { lsKey: 'rf:bank_statements', table: 'bank_statements' },
    { lsKey: 'rf:bank_transactions', table: 'bank_transactions' },
    { lsKey: 'rf:cash_transactions', table: 'cash_transactions' },
    { lsKey: 'rf:cash_balance_log', table: 'cash_balance_log' },
    { lsKey: 'rf:categories', table: 'categories' },
    { lsKey: 'rf:narration_map', table: 'narration_map' },
    { lsKey: 'rf:verticals', table: 'verticals' },
    { lsKey: 'rf:clients', table: 'clients' },
    { lsKey: 'rf:client_monthly_costs', table: 'client_monthly_costs' },
    { lsKey: 'rf:invoices', table: 'invoices' },
    { lsKey: 'rf:team_members', table: 'team_members' },
    { lsKey: 'rf:expense_attributions', table: 'expense_attributions' },
    { lsKey: 'rf:tax_summaries', table: 'tax_summaries' },
    { lsKey: 'rf:guru_conversations', table: 'guru_conversations' },
    { lsKey: 'rf:guru_messages', table: 'guru_messages' },
  ];

  for (const { lsKey, table } of mapping) {
    const raw = localStorage.getItem(lsKey);
    if (!raw) { console.log(`Skip ${table} (no data)`); continue; }
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) { console.log(`Skip ${table} (empty)`); continue; }

    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
        method: 'POST', headers, body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error(`✗ ${table}:`, err);
      } else {
        console.log(`✓ ${table}: ${data.length} rows migrated`);
      }
    } catch (e) {
      console.error(`✗ ${table}:`, e.message);
    }
  }

  // Singleton tables (id = 1)
  const singletons = [
    { lsKey: 'rf:invoice_settings', table: 'invoice_settings' },
    { lsKey: 'rf:tax_settings', table: 'tax_settings' },
    { lsKey: 'rf:app_settings', table: 'app_settings' },
  ];
  for (const { lsKey, table } of singletons) {
    const raw = localStorage.getItem(lsKey);
    if (!raw) continue;
    const data = JSON.parse(raw);
    if (!data) continue;
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
        method: 'POST', headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ ...data, id: 1 }),
      });
      if (!res.ok) console.error(`✗ ${table}:`, await res.text());
      else console.log(`✓ ${table} (singleton) migrated`);
    } catch (e) { console.error(`✗ ${table}:`, e.message); }
  }

  console.log('\n🎉 Migration complete! Now switch storage.ts to the Supabase version and redeploy.');
  alert('Migration complete! Check the console for details, then switch storage.ts and redeploy.');
})();
