// Duffel flight search — TypeScript port for arthur-online's /api/chat.
// Mirrors the canonical CLI implementation at ~/arthur/lib/travel/duffel.js.
// Phase 1: research-only — never books, only returns offer comparisons with
// deep-link URLs Daniel can review before manual purchase. Per Daniel's
// Travel Planner Phase-1 rule (~/.arthur memory).

const BASE = "https://api.duffel.com";
const VERSION = "v2";

function loadToken(): string {
  return (
    process.env.DUFFEL_TOKEN ||
    process.env.DUFFEL_ACCESS_TOKEN ||
    ""
  );
}

export function isTestToken(): boolean {
  const t = loadToken();
  return t.startsWith("duffel_test_");
}

const IATA_MAP: Record<string, string> = {
  "GRAND RAPIDS": "GRR",
  "SAN FRANCISCO": "SFO",
  "NEW YORK": "JFK",
  "CHICAGO": "ORD",
  "LOS ANGELES": "LAX",
  "MIAMI": "MIA",
  "DALLAS": "DFW",
  "HOUSTON": "IAH",
  "DENVER": "DEN",
  "SEATTLE": "SEA",
  "BOSTON": "BOS",
  "ATLANTA": "ATL",
  "WASHINGTON": "DCA",
  "DETROIT": "DTW",
  "MINNEAPOLIS": "MSP",
  "KALAMAZOO": "AZO",
  "PHOENIX": "PHX",
  "LAS VEGAS": "LAS",
  "ORLANDO": "MCO",
  "PORTLAND": "PDX",
};

export function normalizeIATA(code: string): string | null {
  if (!code) return null;
  const c = String(code).trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(c)) return c;
  return IATA_MAP[c] || null;
}

export interface FlightSearchArgs {
  origin: string;
  destination: string;
  depart_date: string;       // YYYY-MM-DD
  return_date?: string;      // YYYY-MM-DD or undefined
  passengers?: number;       // default 1 adult
  cabin?: "economy" | "premium_economy" | "business" | "first";
  max_connections?: number;  // default 1
}

export async function searchFlights(args: FlightSearchArgs): Promise<{ ok: true; offers: any[] } | { ok: false; error: string }> {
  const token = loadToken();
  if (!token) return { ok: false, error: "DUFFEL_TOKEN not set on this Fly app — add the secret with flyctl secrets set DUFFEL_TOKEN=duffel_test_..." };

  const orig = normalizeIATA(args.origin);
  const dest = normalizeIATA(args.destination);
  if (!orig) return { ok: false, error: `Invalid origin: '${args.origin}'. Use IATA code (3 letters) or known city name.` };
  if (!dest) return { ok: false, error: `Invalid destination: '${args.destination}'. Use IATA code (3 letters) or known city name.` };
  if (!args.depart_date || !/^\d{4}-\d{2}-\d{2}$/.test(args.depart_date)) {
    return { ok: false, error: "depart_date required in YYYY-MM-DD format" };
  }

  const slices = [{ origin: orig, destination: dest, departure_date: args.depart_date }];
  if (args.return_date) slices.push({ origin: dest, destination: orig, departure_date: args.return_date });

  const passengerCount = args.passengers || 1;
  const passengers = Array.from({ length: passengerCount }, () => ({ type: "adult" }));

  const body = {
    data: {
      slices,
      passengers,
      cabin_class: args.cabin || "economy",
      max_connections: typeof args.max_connections === "number" ? args.max_connections : 1,
    },
  };

  try {
    const r = await fetch(`${BASE}/air/offer_requests?return_offers=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Duffel-Version": VERSION,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      const txt = await r.text();
      return { ok: false, error: `Duffel HTTP ${r.status}: ${txt.slice(0, 250)}` };
    }
    const j: any = await r.json();
    const offers = (j.data?.offers || []).slice(0, 5).map((o: any) => ({
      total: `${o.total_currency} ${parseFloat(o.total_amount).toFixed(2)}`,
      airline: o.owner?.name || "?",
      slices: (o.slices || []).map((s: any) => ({
        from: s.origin?.iata_code,
        to: s.destination?.iata_code,
        duration: s.duration,
        stops: Math.max(0, (s.segments?.length || 1) - 1),
        depart: s.segments?.[0]?.departing_at,
        arrive: s.segments?.[s.segments.length - 1]?.arriving_at,
        flights: (s.segments || []).map((seg: any) =>
          `${seg.marketing_carrier?.iata_code || ""}${seg.marketing_carrier_flight_number || ""}`
        ),
      })),
    }));
    return { ok: true, offers };
  } catch (e: any) {
    return { ok: false, error: `Duffel error: ${e.message?.slice(0, 200) || String(e).slice(0, 200)}` };
  }
}
