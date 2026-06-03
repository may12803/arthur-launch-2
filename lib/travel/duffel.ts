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


// --- Stays (hotel) search via Duffel Stays API ---
// https://duffel.com/docs/api/v2/stays - Daniel's rules: specific prices not
// ranges, clickable URLs, full nightly + total cost.
export interface HotelSearchArgs {
  location: string;
  check_in: string;
  check_out: string;
  guests?: number;
  rooms?: number;
  max_price_per_night_usd?: number;
}

export interface HotelOffer {
  name: string;
  rating?: number;
  address?: string;
  total_currency: string;
  total_amount: string;
  per_night_amount: string;
  rooms: number;
  nights: number;
  cancellation_policy?: string;
  booking_url: string;
  duffel_offer_id?: string;
  thumbnail_url?: string;
}

export async function searchHotels(args: HotelSearchArgs): Promise<{ ok: true; offers: HotelOffer[] } | { ok: false; error: string }> {
  const token = loadToken();
  if (!token) return { ok: false, error: "DUFFEL_TOKEN not set" };
  if (!args.check_in || !/^\d{4}-\d{2}-\d{2}$/.test(args.check_in)) return { ok: false, error: "check_in YYYY-MM-DD required" };
  if (!args.check_out || !/^\d{4}-\d{2}-\d{2}$/.test(args.check_out)) return { ok: false, error: "check_out YYYY-MM-DD required" };
  const nights = Math.max(1, Math.round((Date.parse(args.check_out) - Date.parse(args.check_in)) / 86400000));
  const guests = args.guests || 2;
  const rooms = args.rooms || 1;
  const body = {
    data: {
      check_in_date: args.check_in,
      check_out_date: args.check_out,
      guests: Array.from({ length: guests }, () => ({ type: "adult" })),
      rooms,
      location: { query: args.location },
    },
  };
  try {
    const r = await fetch(BASE + "/stays/search", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Duffel-Version": VERSION,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) {
      const txt = await r.text();
      return { ok: false, error: "Duffel Stays HTTP " + r.status + ": " + txt.slice(0, 300) };
    }
    const j: any = await r.json();
    const results: any[] = j.data?.results || j.data?.accommodations || [];
    const offers: HotelOffer[] = results.slice(0, 8).map((res: any) => {
      const acc = res.accommodation || res;
      const cheapest = (res.cheapest_rate || res.rates?.[0] || {}) as any;
      const total = parseFloat(cheapest.total_amount || cheapest.price?.amount || "0");
      const ceiling = args.max_price_per_night_usd;
      if (ceiling && (total / nights) > ceiling) return null as any;
      const cur = cheapest.total_currency || cheapest.price?.currency || "USD";
      return {
        name: acc.name || "Hotel",
        rating: acc.rating || acc.stars,
        address: [acc.address?.line_one, acc.address?.city_name, acc.address?.country_code].filter(Boolean).join(", "),
        total_currency: cur,
        total_amount: total.toFixed(2),
        per_night_amount: (total / nights).toFixed(2),
        rooms,
        nights,
        cancellation_policy: cheapest.cancellation_policy || cheapest.payment_method || undefined,
        booking_url: cheapest.deep_link || cheapest.booking_url || acc.url ||
          ("https://www.google.com/travel/hotels?q=" + encodeURIComponent(acc.name + " " + (acc.address?.city_name || args.location))),
        duffel_offer_id: cheapest.id || cheapest.offer_id,
        thumbnail_url: (acc.photos || acc.images)?.[0]?.url,
      };
    }).filter(Boolean);
    return { ok: true, offers };
  } catch (e: any) {
    return { ok: false, error: "Duffel Stays error: " + (e.message?.slice(0, 200) || String(e).slice(0, 200)) };
  }
}
