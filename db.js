// src/lib/db.js
// Quote Generator data layer — Phase 2: Supabase (hq_data) backend
// All function signatures identical to Phase 1; only backend changed.

import { hqRead, hqWrite } from './supabase.js';

const genId = () => 'q' + Date.now() + Math.random().toString(36).slice(2, 7);

// ─── QUOTES ─────────────────────────────────────────────────────────────────

export async function getQuotes() {
  return await hqRead('quotes', []);
}

export async function getQuote(id) {
  const quotes = await hqRead('quotes', []);
  return quotes.find(q => q.id === id) || null;
}

export async function createQuote(data) {
  const quotes = await hqRead('quotes', []);
  const quote  = {
    ...data,
    id:         data.id || genId(),
    createdAt:  data.createdAt  || new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
    status:     data.status || 'draft',
  };
  await hqWrite('quotes', [quote, ...quotes]);
  return quote;
}

export async function saveQuote(data) {
  const quotes = await hqRead('quotes', []);
  const quote  = { ...data, updatedAt: new Date().toISOString() };
  const idx    = quotes.findIndex(q => q.id === quote.id);
  let updated;
  if (idx >= 0) {
    updated = [...quotes];
    updated[idx] = quote;
  } else {
    updated = [{ ...quote, createdAt: quote.createdAt || new Date().toISOString() }, ...quotes];
  }
  await hqWrite('quotes', updated);
  return quote;
}

export async function deleteQuote(id) {
  const quotes = await hqRead('quotes', []);
  await hqWrite('quotes', quotes.filter(q => q.id !== id));
}

// ─── SERVICES ────────────────────────────────────────────────────────────────

export async function getServices() {
  return await hqRead('services', []);
}

export async function saveServices(services) {
  await hqWrite('services', services);
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

export async function getSettings() {
  const defaults = {
    tcBlock:                 '',
    markupTiers:             { 6: 65 },
    metaAdsFeeFlat:          15000,
    metaAdsFeePercent:       20,
    influencerFeePercent:    20,
    productionAddOnPercent:  20,
    address:                 'G2, Zainab Manzil, Club Road, Chetpet, Chennai',
    phone:                   '+91 73585 85884',
    website:                 'respawnmedia.in',
    team:                    [],
    attendanceSheetLink:     '',
    payrollSheetLink:        '',
  };
  const saved = await hqRead('settings', {});
  return { ...defaults, ...saved };
}

export async function saveSettings(settings) {
  await hqWrite('settings', settings);
}
