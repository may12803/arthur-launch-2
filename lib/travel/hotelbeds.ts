// hotelbeds.ts — Hotelbeds Hotel Booking API wrapper.
// Functional-best alternative to Duffel Stays (invitation-only) and to
// browser-driving Booking.com (requires Daniel Chrome). Per kernel Rule 24.
//
// Signup: developer.hotelbeds.com -> My Apps -> Create New App.
// Sandbox is instant; production needs ~1-week approval but same key shape.
//
// Auth: API-Key + X-Signature where signature = SHA256(api_key + secret + epoch).
// Sandbox base: https://api.test.hotelbeds.com
// Production base: https://api.hotelbeds.com

import { createHash } from "node:crypto";

const SANDBOX_BASE = "https://api.test.hotelbeds.com";
const PRODUCTION_BASE = "https://api.hotelbeds.com";

function loadKey(): { key: string; secret: string; base: string } | null {
  const key = process.env.HOTELBEDS_API_KEY;
  const secret = process.env.HOTELBEDS_SECRET;
  const env = (process.env.HOTELBEDS_ENV || "sandbox").toLowerCase();
  if (!key || !secret) return null;
  return { key, secret, base: env === "production" || env === "live" ? PRODUCTION_BASE : SANDBOX_BASE };
}

function signature(key: string, secret: string): string {
  const epoch = Math.floor(Date.now() / 1000);
  return createHash("sha256").update(key + secret + epoch).digest("hex");
}

function headers(creds: { key: string; secret: string }): Record<string, string> {
  return {
    "Api-key": creds.key,
    "X-Signature": signature(creds.key, creds.secret),
    Accept: "application/json",
    "Accept-Encoding": "gzip",
    "Content-Type": "application/json",
  };
}

export interface HotelbedsSearchArgs {
  location: string;
  check_in: string;
  check_out: string;
  guests?: number;
  rooms?: number;
  max_price_per_night_usd?: number;
}

export interface HotelbedsOffer {
  name: string;
  rating?: number;
  address?: string;
  city?: string;
  total_currency: string;
  total_amount: string;
  per_night_amount: string;
  rooms: number;
  nights: number;
  refundable: boolean;
  cancellation_policy?: string;
  booking_url: string;
  hotelbeds_rate_key?: string;
  category?: string;
}

const destCache = new Map<string, string>();
async function resolveDestinationCode(location: string, creds: { key: string; secret: string; base: string }): Promise<string | null> {
  const key = location.toLowerCase().trim();
  if (destCache.has(key)) return destCache.get(key)!;
  if (/^[A-Z]{3}$/.test(location.trim())) {
    destCache.set(key, location.trim());
    return location.trim();
  }
  const wellKnown: Record<string, string> = {
    "savannah": "SAV", "savannah, georgia": "SAV", "savannah, ga": "SAV",
    "new orleans": "NOR", "new orleans, louisiana": "NOR", "new orleans, la": "NOR",
    "chicago": "CHI", "new york": "NYC", "miami": "MIA", "los angeles": "LAX",
    "san francisco": "SFO", "atlanta": "ATL", "seattle": "SEA", "boston": "BOS",
    "washington dc": "WAS", "washington, dc": "WAS", "denver": "DEN", "dallas": "DAL",
    "kalamazoo": "AZO", "kalamazoo, mi": "AZO", "kalamazoo, michigan": "AZO",
    "nashville": "BNA", "austin": "AUS", "phoenix": "PHX", "las vegas": "LAS",
    "orlando": "MCO", "portland, or": "PDX", "minneapolis": "MSP", "houston": "HOU",
    "detroit": "DTT", "san diego": "SAN", "philadelphia": "PHL", "charleston, sc": "CHS",
  };
  const mapped = wellKnown[key];
  if (mapped) { destCache.set(key, mapped); return mapped; }
  try {
    const url = creds.base + "/hotel-content-api/1.0/locations/destinations?fields=code,name&language=ENG&from=1&to=10&filter=" + encodeURIComponent(location);
    const r = await fetch(url, { headers: headers(creds), signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    const code = j?.destinations?.[0]?.code;
    if (code) { destCache.set(key, code); return code; }
  } catch {}
  return null;
}

export async function searchHotelbeds(args: HotelbedsSearchArgs): Promise<{ ok: true; offers: HotelbedsOffer[]; sandbox: boolean } | { ok: false; error: string }> {
  const creds = loadKey();
  if (!creds) return { ok: false, error: "HOTELBEDS_API_KEY or HOTELBEDS_SECRET not set. Sign up at developer.hotelbeds.com -> My Apps -> Create App; put keys in ~/.arthur/vault/hotelbeds.env." };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.check_in)) return { ok: false, error: "check_in YYYY-MM-DD required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.check_out)) return { ok: false, error: "check_out YYYY-MM-DD required" };
  const nights = Math.max(1, Math.round((Date.parse(args.check_out) - Date.parse(args.check_in)) / 86400000));

  const destCode = await resolveDestinationCode(args.location, creds);
  if (!destCode) return { ok: false, error: "Could not resolve location '" + args.location + "' to a Hotelbeds destination code." };

  const guests = args.guests || 2;
  const rooms = args.rooms || 1;
  const body = {
    stay: { checkIn: args.check_in, checkOut: args.check_out },
    occupancies: [{ rooms, adults: guests, children: 0 }],
    destination: { code: destCode },
  };

  try {
    const r = await fetch(creds.base + "/hotel-api/1.0/hotels", {
      method: "POST",
      headers: headers(creds),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) {
      const txt = await r.text();
      return { ok: false, error: "Hotelbeds HTTP " + r.status + ": " + txt.slice(0, 400) };
    }
    const j: any = await r.json();
    const hotels: any[] = j?.hotels?.hotels || [];
    const offers: HotelbedsOffer[] = hotels.slice(0, 8).map((h: any) => {
      const rates = (h.rooms || []).flatMap((rm: any) => rm.rates || []);
      if (!rates.length) return null as any;
      rates.sort((a: any, b: any) => parseFloat(a.net) - parseFloat(b.net));
      const r = rates[0];
      const total = parseFloat(r.net || r.sellingRate || "0");
      const ceiling = args.max_price_per_night_usd;
      if (ceiling && (total / nights) > ceiling) return null as any;
      const cur = h.currency || r.currency || "USD";
      const refundable = !r.cancellationPolicies?.length || r.cancellationPolicies.every((cp: any) => {
        const cpDate = cp.from ? new Date(cp.from) : null;
        return cpDate ? cpDate >= new Date(args.check_in) : true;
      });
      const bookingUrl = r.rateKey
        ? "https://secure.hotelbeds.com/booking?rateKey=" + encodeURIComponent(r.rateKey)
        : "https://www.google.com/travel/hotels?q=" + encodeURIComponent(h.name + " " + (h.destinationName || args.location));
      return {
        name: h.name || "Hotel",
        rating: h.categoryName ? (parseFloat((h.categoryName.match(/\d+/) || [""])[0]) || undefined) : undefined,
        address: h.address?.content || h.address,
        city: h.destinationName || h.zoneName,
        total_currency: cur,
        total_amount: total.toFixed(2),
        per_night_amount: (total / nights).toFixed(2),
        rooms,
        nights,
        refundable,
        cancellation_policy: refundable ? "Free cancellation" : (r.cancellationPolicies?.[0]?.amount ? "Penalty " + r.cancellationPolicies[0].amount + " " + cur : "Non-refundable"),
        booking_url: bookingUrl,
        hotelbeds_rate_key: r.rateKey,
        category: h.categoryName,
      };
    }).filter(Boolean);
    return { ok: true, offers, sandbox: creds.base.includes("test.hotelbeds.com") };
  } catch (e: any) {
    return { ok: false, error: "Hotelbeds error: " + (e.message?.slice(0, 200) || String(e).slice(0, 200)) };
  }
}
