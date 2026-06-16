// src/lib/supabase.js
// Supabase client + key-value helpers for HQ data
// Phase 2: stores all app data in hq_data table (same shape as Gist JSON)

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (url && key) ? createClient(url, key) : null;
export const SUPABASE_ENABLED = !!(url && key);

if (!SUPABASE_ENABLED) {
  console.warn('[HQ] Supabase not configured — data will only persist in localStorage.');
}

// ─── Core read/write via hq_data table ──────────────────────────────────────

/** Read a value from hq_data by key. Falls back to localStorage cache. */
export async function hqRead(key, fallback = null) {
  // Always try localStorage first for instant load
  const cacheKey = `hq_cache:${key}`;
  const cached   = localStorage.getItem(cacheKey);

  if (SUPABASE_ENABLED && supabase) {
    try {
      const { data, error } = await supabase
        .from('hq_data')
        .select('value')
        .eq('key', key)
        .maybeSingle();

      if (!error && data !== null) {
        // Update cache
        localStorage.setItem(cacheKey, JSON.stringify(data.value));
        return data.value ?? fallback;
      }
    } catch (e) {
      console.warn(`[HQ] Supabase read(${key}) failed, using cache:`, e.message);
    }
  }

  // Fallback to localStorage
  if (cached !== null) {
    try { return JSON.parse(cached) ?? fallback; } catch { /* ignore */ }
  }
  return fallback;
}

/** Write a value to hq_data and update localStorage cache. */
export async function hqWrite(key, value) {
  // Write to localStorage immediately
  localStorage.setItem(`hq_cache:${key}`, JSON.stringify(value));

  if (SUPABASE_ENABLED && supabase) {
    try {
      await supabase.from('hq_data').upsert({
        key,
        value,
        updated_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn(`[HQ] Supabase write(${key}) failed:`, e.message);
    }
  }
}

/** Pull all HQ data from Supabase into localStorage cache on app load. */
export async function pullAllFromSupabase() {
  if (!SUPABASE_ENABLED || !supabase) return;
  try {
    const { data } = await supabase.from('hq_data').select('key, value');
    if (data) {
      data.forEach(row => {
        localStorage.setItem(`hq_cache:${row.key}`, JSON.stringify(row.value));
      });
    }
  } catch (e) {
    console.warn('[HQ] Pull from Supabase failed:', e.message);
  }
}

/** One-time migration: read from Gist, write everything to Supabase. */
export async function migrateFromGist() {
  const gistId    = import.meta.env.VITE_GIST_ID;
  const gistToken = import.meta.env.VITE_GIST_TOKEN;

  if (!gistId || !gistToken) {
    return { ok: false, error: 'VITE_GIST_ID or VITE_GIST_TOKEN not set in Vercel' };
  }
  if (!SUPABASE_ENABLED) {
    return { ok: false, error: 'Supabase not configured' };
  }

  try {
    const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { Authorization: `token ${gistToken}` }
    });
    if (!resp.ok) return { ok: false, error: `Gist fetch failed: ${resp.status}` };

    const gist     = await resp.json();
    const raw      = gist.files['respawn-data.json']?.content;
    if (!raw)       return { ok: false, error: 'respawn-data.json not found in Gist' };

    const gistData = JSON.parse(raw);
    const hr       = gistData.hr || {};

    // Write all sections to hq_data
    await Promise.all([
      hqWrite('quotes',            gistData.quotes   || []),
      hqWrite('services',          gistData.services || []),
      hqWrite('settings',          gistData.settings || {}),
      hqWrite('hr_employees',      hr.employees      || []),
      hqWrite('hr_attendance',     hr.attendance     || []),
      hqWrite('hr_leave_requests', hr.leave_requests || hr.leaveRequests || []),
      hqWrite('hr_holidays',       hr.holidays       || []),
      hqWrite('hr_onboarding',     hr.onboarding     || []),
    ]);

    return {
      ok: true,
      counts: {
        quotes:        (gistData.quotes   || []).length,
        services:      (gistData.services || []).length,
        employees:     (hr.employees      || []).length,
        attendance:    (hr.attendance     || []).length,
        leaveRequests: (hr.leave_requests || hr.leaveRequests || []).length,
        holidays:      (hr.holidays       || []).length,
        onboarding:    (hr.onboarding     || []).length,
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
