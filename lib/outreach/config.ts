// Outreach configuration. Everything here is read from env with safe defaults; nothing in this folder can
// send mail unless OUTREACH_SENDING_ENABLED is exactly "1" (see transport.ts and scheduler.ts).
export type Env = Record<string, string | undefined>;

export const SEQUENCE = [
  { step: 1, afterDays: 0, label: 'initial' },
  { step: 2, afterDays: 4, label: 'follow-up' },
  { step: 3, afterDays: 10, label: 'close-the-loop' },
] as const;
export const MAX_STEP = SEQUENCE.length;
export const dayOffsetForStep = (step: number) => SEQUENCE.find((s) => s.step === step)?.afterDays ?? 0;

export interface RampStep { fromDay: number; cap: number }
// Warm-up ramp: from day N of sending (1-based, counted from OUTREACH_WARMUP_START) the daily cap is `cap`.
export const DEFAULT_RAMP: RampStep[] = [
  { fromDay: 1, cap: 10 }, { fromDay: 4, cap: 25 }, { fromDay: 8, cap: 50 },
  { fromDay: 15, cap: 100 }, { fromDay: 22, cap: 200 }, { fromDay: 29, cap: 300 },
];

export const DEFAULT_BLOCKED_SEGMENTS = ['wire', 'cable', 'electrical supply', 'electrical distribution', 'Superior Essex', 'Essex'];
export const DEFAULT_BLOCKED_DOMAINS = ['superioressex.com', 'essexbrownell.com'];

export interface OutreachConfig {
  sendingEnabled: boolean;
  postalAddress: string | null;
  tokenSecret: string | null;
  baseUrl: string;
  unsubscribeMailto: string | null;
  dailyCap: number;
  perDomainPerDay: number;
  sendIntervalMs: number;
  warmupStart: string | null;
  ramp: RampStep[];
  timeZone: string;
  blockedSegments: string[];
  blockedDomains: string[];
}

const list = (v: string | undefined, d: string[]) => (v && v.trim() ? v.split(',').map((s) => s.trim()).filter(Boolean) : d);
const int = (v: string | undefined, d: number) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : d; };

export function parseRamp(v: string | undefined): RampStep[] {
  if (!v || !v.trim()) return DEFAULT_RAMP;
  const out = v.split(',').map((p) => p.trim().split(':').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite)).map(([fromDay, cap]) => ({ fromDay, cap }));
  return out.length ? out.sort((a, b) => a.fromDay - b.fromDay) : DEFAULT_RAMP;
}

// Sending is on ONLY for the literal string "1". Anything else (unset, "true", "yes", "0") is off.
export const sendingEnabled = (env: Env) => env.OUTREACH_SENDING_ENABLED === '1';

export function loadConfig(env: Env = process.env): OutreachConfig {
  return {
    sendingEnabled: sendingEnabled(env),
    postalAddress: env.OUTREACH_POSTAL_ADDRESS?.trim() || null,
    tokenSecret: env.OUTREACH_TOKEN_SECRET?.trim() || null,
    baseUrl: (env.OUTREACH_PUBLIC_BASE_URL?.trim() || 'https://portal.loveleedaystudios.com').replace(/\/+$/, ''),
    unsubscribeMailto: env.OUTREACH_UNSUBSCRIBE_MAILTO?.trim() || null,
    dailyCap: int(env.OUTREACH_DAILY_CAP, 300),
    perDomainPerDay: int(env.OUTREACH_PER_DOMAIN_PER_DAY, 2),
    sendIntervalMs: int(env.OUTREACH_SEND_INTERVAL_MS, 20_000),
    warmupStart: env.OUTREACH_WARMUP_START?.trim() || null,
    ramp: parseRamp(env.OUTREACH_WARMUP_RAMP),
    timeZone: env.OUTREACH_TIMEZONE?.trim() || 'America/New_York',
    blockedSegments: list(env.OUTREACH_BLOCKED_SEGMENTS, DEFAULT_BLOCKED_SEGMENTS),
    blockedDomains: list(env.OUTREACH_BLOCKED_DOMAINS, DEFAULT_BLOCKED_DOMAINS).map((d) => d.toLowerCase()),
  };
}

// ---- calendar helpers (day boundaries are in the configured time zone, default America/New_York) ----
function ymdInTz(d: Date, tz: string): [number, number, number] {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-').map(Number);
  return [p[0], p[1], p[2]];
}
export const dayKey = (d: Date, tz: string) => ymdInTz(d, tz).join('-');

export function startOfDay(d: Date, tz: string): Date {
  const [y, m, day] = ymdInTz(d, tz);
  const target = Date.UTC(y, m - 1, day);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(guess));
    const g = (t: string) => Number(parts.find((x) => x.type === t)!.value);
    const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    guess += target - asUtc;
  }
  return new Date(guess);
}

// Today's send cap. Not started (no OUTREACH_WARMUP_START, or start is in the future) = 0, never a guess.
export function dailyCapFor(cfg: OutreachConfig, now: Date): number {
  if (!cfg.warmupStart || !/^\d{4}-\d{2}-\d{2}$/.test(cfg.warmupStart)) return 0;
  const [y, m, d] = dayKey(now, cfg.timeZone).split('-').map(Number);
  const [sy, sm, sd] = cfg.warmupStart.split('-').map(Number);
  const day = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / 86_400_000) + 1;
  if (day < 1) return 0;
  let cap = 0;
  for (const r of cfg.ramp) if (day >= r.fromDay) cap = r.cap;
  return Math.min(cap, cfg.dailyCap);
}
