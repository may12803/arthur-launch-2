// Server-side helpers for the connector-platform API routes. Reconcile with lib/connectors at merge.
//
// RPC argument names below follow CONTRACT.md's names and the house pattern (p_tenant first, then named p_ args). The
// contract fixes RPC names but not every argument; where a route guesses an argument or an RPC the contract does not
// list, it is marked `CONTRACT GAP` so the SQL author can match it.
import { NextResponse } from "next/server";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");
export const sha256B64Url = (s: string) => b64url(createHash("sha256").update(s).digest());
export const randomToken = (bytes: number) => b64url(randomBytes(bytes));

// Constant-time string compare that does not leak length through an early return.
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

export function connectorsServerSecret(): string | null {
  const s = process.env.LOVELEEDAY_CONNECTORS_SERVER_SECRET;
  return s && s.length >= 32 ? s : null;
}

// Database refusals are shown to the person, not swallowed. Plain-language refusals keep their text; anything else
// still names the failing step so it can be reported.
export function dbFail(message: string, step?: string) {
  const m = message.toLowerCase();
  const status = m.includes("not signed in") || m.includes("two-factor") ? 401 : m.includes("only an owner") || m.includes("not allowed") || m.includes("permission denied") ? 403 : m.includes("not found") || m.includes("unknown") ? 404 : m.includes("larger than") || m.includes("too many") ? 413 : m.includes("does not exist") || m.includes("could not find the function") ? 501 : 500;
  const text = status === 501 ? `${step ? `${step}: ` : ""}the database function for this is not installed yet (${message}).` : step ? `${step}: ${message}` : message;
  return NextResponse.json({ error: text }, { status });
}

export function clip(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

export const isAdminRole = (role: string | undefined) => role === "owner" || role === "admin";
export const isMemberRole = (role: string | undefined) => role === "owner" || role === "admin" || role === "member" || role === "staff";
