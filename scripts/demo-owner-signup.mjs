#!/usr/bin/env node
/**
 * Creates the Harbor & Vine (demo) owner through the product's public auth signup
 * (anon key, same endpoint the /client signup form uses). Password is generated and
 * written to ~/.arthur/vault/harborvine-demo.env (mode 600); it is never printed.
 * Run: arthur-cred run --use supabase-loveleeday -- node scripts/demo-owner-signup.mjs
 * The confirmation email goes to arthur+harborvine@loveleedaystudios.com (Daniel-controlled).
 */
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

const EMAIL = "arthur+harborvine@loveleedaystudios.com";
const url = process.env.SUPABASE_LOVELEEDAY_URL;
const key = process.env.SUPABASE_LOVELEEDAY_ANON_KEY || process.env.SUPABASE_LOVELEEDAY_PUBLISHABLE_KEY;
const vault = `${homedir()}/.arthur/vault/harborvine-demo.env`;
let password;
if (existsSync(vault)) password = /HARBORVINE_DEMO_PASSWORD=(.*)/.exec(readFileSync(vault, "utf8"))?.[1];
if (!password) {
  password = randomBytes(18).toString("base64url");
  writeFileSync(vault, `HARBORVINE_DEMO_EMAIL=${EMAIL}\nHARBORVINE_DEMO_PASSWORD=${password}\n`);
  chmodSync(vault, 0o600);
}
const r = await fetch(`${url}/auth/v1/signup`, {
  method: "POST", headers: { apikey: key, "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password, data: { demo: true, tenant: "Harbor & Vine (demo)" } }),
});
const j = await r.json();
console.log(r.status, JSON.stringify({ id: j.id || j.user?.id, email: j.email || j.user?.email, confirmed: !!(j.email_confirmed_at || j.user?.email_confirmed_at), error: j.msg || j.error_description || j.error }));
