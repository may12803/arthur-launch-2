#!/usr/bin/env node
/**
 * One-off / idempotent setup: creates (or resets the password of) a real
 * Supabase Auth user that arthur-online's shared-password login bridges into,
 * so supabase.auth.mfa.* has an actual AAL1 session to upgrade to AAL2.
 *
 * arthur-online has no per-user accounts (single shared ARTHUR_ONLINE_PASSWORD
 * gate) — this script creates the one Supabase Auth identity that stands in
 * for that shared login. /api/login signs into it with signInWithPassword
 * using ARTHUR_ONLINE_EMAIL + ARTHUR_ONLINE_SUPABASE_PASSWORD from env.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap-mfa-user.mjs
 *
 * Prints EMAIL= and PASSWORD= — set both as Fly secrets:
 *   flyctl secrets set -c fly.toml -a arthur-online ARTHUR_ONLINE_EMAIL=... ARTHUR_ONLINE_SUPABASE_PASSWORD=...
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}

const email = process.env.ARTHUR_ONLINE_EMAIL || `${process.env.ARTHUR_ONLINE_USER || "daniel"}@arthur-online.internal`;
const password = process.env.ARTHUR_ONLINE_SUPABASE_PASSWORD || crypto.randomBytes(24).toString("base64url");

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findByEmail(targetEmail) {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === targetEmail);
    if (found) return found;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function main() {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!createErr) {
    console.log("created new Supabase Auth user", created.user.id);
  } else {
    const existing = await findByEmail(email);
    if (!existing) throw createErr;
    const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, { password });
    if (updErr) throw updErr;
    console.log("reset password on existing Supabase Auth user", existing.id);
  }

  console.log(`EMAIL=${email}`);
  console.log(`PASSWORD=${password}`);
}

main().catch((e) => {
  console.error("bootstrap-mfa-user failed:", e.message || e);
  process.exit(1);
});
