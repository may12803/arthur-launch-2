// Per-source fetchers. Each returns observations with ISO dates and finite numeric values; failures throw with the HTTP status only
// (never the request URL, which carries the key).
import type { Obs, SeriesDef } from "./catalog.ts";

type Fetch = typeof fetch;

async function getJson(res: Response, label: string): Promise<any> {
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  try { return await res.json(); } catch { throw new Error(`${label} returned a non-JSON body (HTTP ${res.status})`); }
}

export async function fetchFred(defs: SeriesDef[], startDate: string, key: string, doFetch: Fetch = fetch): Promise<Obs[]> {
  const out: Obs[] = [];
  for (const d of defs) {
    const q = new URLSearchParams({ series_id: d.source_series_id, api_key: key, file_type: "json", observation_start: startDate });
    const j = await getJson(await doFetch(`https://api.stlouisfed.org/fred/series/observations?${q}`), `FRED ${d.source_series_id}`);
    for (const o of j.observations ?? []) {
      const v = Number(o.value);
      if (o.value !== "." && Number.isFinite(v)) out.push({ series_id: d.id, obs_date: o.date, value: v });
    }
  }
  return out;
}

// BLS v2: up to 50 series and 20 years per query, 500 queries a day. Quarterly periods (Q01..Q04) are dated to the quarter's last month.
export async function fetchBls(defs: SeriesDef[], startYear: number, endYear: number, key: string, doFetch: Fetch = fetch): Promise<Obs[]> {
  const out: Obs[] = [];
  const byBls = new Map(defs.map((d) => [d.source_series_id, d.id]));
  for (let i = 0; i < defs.length; i += 50) {
    const chunk = defs.slice(i, i + 50);
    for (let y = startYear; y <= endYear; y += 20) {
      const body = { seriesid: chunk.map((d) => d.source_series_id), startyear: String(y), endyear: String(Math.min(y + 19, endYear)), registrationkey: key };
      const j = await getJson(await doFetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), "BLS");
      if (j.status !== "REQUEST_SUCCEEDED") throw new Error(`BLS status ${j.status}`);
      for (const s of j.Results?.series ?? []) {
        const id = byBls.get(s.seriesID);
        if (!id) continue;
        for (const o of s.data ?? []) {
          const v = Number(o.value);
          if (!Number.isFinite(v)) continue;
          let month: number;
          if (/^M(0[1-9]|1[0-2])$/.test(o.period)) month = Number(o.period.slice(1));
          else if (/^Q0[1-4]$/.test(o.period)) month = Number(o.period.slice(2)) * 3;
          else continue; // M13 annual average and other non-monthly periods
          out.push({ series_id: id, obs_date: `${o.year}-${String(month).padStart(2, "0")}-01`, value: v });
        }
      }
    }
  }
  return out;
}

export async function fetchEia(defs: SeriesDef[], startDate: string, key: string, doFetch: Fetch = fetch): Promise<Obs[]> {
  const out: Obs[] = [];
  for (const d of defs) {
    if (!d.eia) continue;
    for (let offset = 0; ; offset += 5000) {
      const q = new URLSearchParams({ api_key: key, frequency: d.eia.frequency, "data[0]": "value", start: startDate, length: "5000", offset: String(offset) });
      q.append("facets[series][]", d.eia.series);
      q.append("sort[0][column]", "period");
      q.append("sort[0][direction]", "asc");
      const j = await getJson(await doFetch(`https://api.eia.gov/v2/${d.eia.route}/data/?${q}`), `EIA ${d.eia.series}`);
      const rows: any[] = j.response?.data ?? [];
      for (const r of rows) {
        const v = Number(r.value);
        if (r.value !== null && r.value !== "" && Number.isFinite(v)) out.push({ series_id: d.id, obs_date: r.period, value: v });
      }
      if (rows.length < 5000) break;
    }
  }
  return out;
}
