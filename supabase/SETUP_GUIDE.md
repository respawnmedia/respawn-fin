# Supabase Backend Setup Guide

This walks you through migrating Respawn Finance from `localStorage` (per-browser) to **Supabase** — a real database where all your data lives in the cloud, accessible from any device, synced in real time.

---

## Why Supabase?

- **Free tier is huge**: 500MB database, 5GB bandwidth, 50K monthly active users. You'll never come close to the limits.
- **Postgres under the hood**: Real SQL queries, no vendor lock-in. If you ever want to leave, you can export everything.
- **Built-in auth**: You're already using a password gate; Supabase Auth replaces it with real user accounts (so Tanay and Arihant can log in separately).
- **Realtime sync**: When you add a transaction on your laptop, your phone sees it instantly.
- **Phase 2 was designed for this**: `storage.ts` already abstracts every database call. We rewrite that one file, and the entire app keeps working.

---

## Step 1 — Create the Supabase project (5 min)

1. Go to [supabase.com](https://supabase.com) → **Sign in** with GitHub
2. Click **New Project**
   - **Name**: `respawn-finance`
   - **Database password**: Generate a strong one and save it in your password manager. You'll rarely need this — Supabase manages the connection for you.
   - **Region**: `Mumbai (ap-south-1)` — closest to Chennai, fastest queries
   - **Plan**: Free
3. Wait ~2 minutes for the project to provision

## Step 2 — Run the schema (2 min)

1. In Supabase dashboard → **SQL Editor** (left sidebar)
2. Click **New Query**
3. Open the file `supabase/schema.sql` from this repo, copy ALL contents
4. Paste into SQL editor → **Run**
5. You should see "Success" — this creates all 18 tables, indexes, and security policies

## Step 3 — Get your project credentials (1 min)

1. **Settings** (gear icon, bottom-left) → **API**
2. Copy these two values:
   - **Project URL** — looks like `https://xxxxx.supabase.co`
   - **anon / public key** — long string starting with `eyJ...`

## Step 4 — Add to Vercel (2 min)

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add:
   - `VITE_SUPABASE_URL` = (Project URL from step 3)
   - `VITE_SUPABASE_ANON_KEY` = (anon key from step 3)
3. **Redeploy** — Vercel → Deployments tab → click the three-dot menu on the latest deploy → Redeploy

## Step 5 — Swap storage.ts (10 min)

The repo includes a Supabase-backed version of storage at `supabase/storage-supabase.ts`. To activate:

```bash
# In your project root
npm install @supabase/supabase-js
cp supabase/storage-supabase.ts src/lib/storage.ts
```

Then commit and push — Vercel will auto-deploy.

## Step 6 — Migrate existing data (optional, 5 min)

If you've already entered data in the localStorage version and don't want to re-enter it:

1. Open the deployed app in your browser, **before swapping storage.ts**
2. Open browser DevTools → Console
3. Paste the contents of `supabase/migrate.js` and run it
4. This copies all your localStorage data into Supabase via the REST API
5. Refresh — your data is now in the cloud

---

## What you get

- **Multi-device**: Open the app on your phone, laptop, or office computer — same data everywhere
- **Multi-user**: Sign up Tanay and Arihant as separate users in Supabase Auth → they can all use the app independently. Audit log already tracks who did what.
- **Backups**: Supabase backs up your database daily. You don't have to do anything.
- **Direct DB access**: Need to fix something quickly? Supabase Table Editor lets you edit rows like a spreadsheet.

---

## Costs

- **Free tier**: 500MB database (your data will fit easily — a year of transactions = ~10MB), 5GB bandwidth/month
- If you exceed: $25/month for Pro tier (8GB database, 250GB bandwidth)
- You will likely never need to upgrade

---

## Frequently Asked

**Q: Can I still keep localStorage as a backup?**
A: Yes. Keep the original `storage.ts` saved somewhere. If Supabase ever goes down (rare), you can swap back temporarily — though data added during the outage won't sync.

**Q: What if I want to leave Supabase?**
A: It's just Postgres. Use `pg_dump` to export everything to a SQL file. You can spin it up on any Postgres host (Neon, Railway, your own server).

**Q: Is the data encrypted?**
A: Yes — at rest (Supabase encrypts the disk) and in transit (HTTPS). Plus, you can encrypt sensitive fields at the app level before storing them if you want.

**Q: How do I add team logins?**
A: In Supabase → Authentication → Users → Add user (email + password). They visit the app, enter those credentials, and they're in. We can wire up a real login form on top of the current password gate if you want.

