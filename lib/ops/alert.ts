// Operational alerts: something degraded that a person should know about (a limiter running on local counts, an upload
// that could not be cleaned up, a purge that stopped). Always logged under one searchable tag; emailed to the ops inbox
// at most once per key per hour per process, so a sustained outage is one email, not a flood.
import { sendPortalMail } from "../client-portal/mailer.ts";

const OPS_INBOX = process.env.OPS_ALERT_EMAIL || "hello@loveleedaystudios.com";
const QUIET_MS = 60 * 60 * 1000;
const lastSent = new Map<string, number>();

type Send = (to: string, subject: string, lines: string[]) => Promise<boolean>;

export async function opsAlert(key: string, message: string, detail: Record<string, unknown> = {}, send: Send = sendPortalMail, now = Date.now()): Promise<"emailed" | "logged"> {
  console.error(`[ops-alert] ${key}: ${message}`, detail);
  const prev = lastSent.get(key);
  if (prev !== undefined && now - prev < QUIET_MS) return "logged";
  lastSent.set(key, now);
  const ok = await send(OPS_INBOX, `Portal alert: ${key}`, [message, `Details: ${JSON.stringify(detail)}`, "Further alerts with this key are logged only for the next hour."]).catch(() => false);
  return ok ? "emailed" : "logged";
}

export function resetOpsAlertsForTests() { lastSent.clear(); }
