// Tolerant value parsers for messy exports. Every parser returns null instead of guessing.

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

export function parseMoney(raw: string): number | null {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/^(usd|us\$)\s*/i, '').replace(/[$\s]/g, '');
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** ISO, US m/d/y (d/m/y only when the first part cannot be a month), yyyymmdd, "Jan 5, 2024", Excel serial. Else null. */
export function parseDate(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[ T].*)?$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const a = +m[1], b = +m[2];
    return a > 12 ? validYmd(y, b, a) : validYmd(y, a, b);
  }
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m && MONTHS[m[1].slice(0, 4).toLowerCase()] || m && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
    return validYmd(+m[3], MONTHS[m[1].slice(0, 4).toLowerCase()] ?? MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  }
  m = /^(\d{1,2})[- ]([A-Za-z]{3,9})[- ,]+(\d{4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) return validYmd(+m[3], mo, +m[1]);
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial >= 32874 && serial <= 73050) {
      const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return dt.toISOString().slice(0, 10);
    }
  }
  return null;
}

export function parseQty(raw: string): number | null {
  const n = parseMoney(raw);
  return n === null ? null : n;
}

export const isBlank = (s: string | undefined) => s === undefined || String(s).trim() === '';
