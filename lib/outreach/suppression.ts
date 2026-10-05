import type { OutreachConfig } from './config.ts';

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const domainOf = (e: string) => normalizeEmail(e).split('@')[1] ?? '';
export const isEmail = (s: string) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s.trim());

export interface SuppressionEntry { email: string | null; domain: string | null; reason: string; source: string; created_at: string }

// A suppression entry matches by exact address or by domain (the domain also covers its subdomains).
export function matchesSuppression(entries: SuppressionEntry[], email: string): SuppressionEntry | null {
  const e = normalizeEmail(email);
  const d = domainOf(e);
  for (const s of entries) {
    if (s.email && normalizeEmail(s.email) === e) return s;
    if (s.domain) {
      const sd = s.domain.trim().toLowerCase();
      if (d === sd || d.endsWith('.' + sd)) return s;
    }
  }
  return null;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Blocked segments: whole-word, case-insensitive match against the org name, so "Essex" blocks Essex Brownell but not Wessex.
export function blockedSegment(org: string | null | undefined, email: string | null | undefined, cfg: Pick<OutreachConfig, 'blockedSegments' | 'blockedDomains'>): string | null {
  const o = (org ?? '').toLowerCase();
  for (const k of cfg.blockedSegments) {
    const kw = k.trim().toLowerCase();
    if (kw && new RegExp(`(^|[^a-z0-9])${esc(kw)}(s|es)?($|[^a-z0-9])`).test(o)) return k;
  }
  const d = email ? domainOf(email) : '';
  for (const bd of cfg.blockedDomains) if (d && (d === bd || d.endsWith('.' + bd))) return bd;
  return null;
}
