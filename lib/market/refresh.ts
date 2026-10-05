// Fetch every catalog series and hand it to a sink. Shared by the daily cron route (sink = connectors-secret RPC) and the backfill
// script (sink = SQL). Idempotent: observations upsert on (series_id, obs_date), so reruns and overlapping windows are safe.
import { SERIES, seriesMeta, type Obs, type SeriesDef } from "./catalog.ts";
import { fetchBls, fetchEia, fetchFred } from "./sources.ts";

export type Keys = { FRED_API_KEY?: string; BLS_API_KEY?: string; EIA_API_KEY?: string };
export type Sink = (series: ReturnType<typeof seriesMeta>[], obs: Obs[]) => Promise<void>;
export type Report = { series: string; fetched: number; error?: string }[];

export async function refreshMarket(opts: { years: number; keys: Keys; sink: Sink; now?: Date; doFetch?: typeof fetch }): Promise<Report> {
  const now = opts.now ?? new Date();
  const startYear = now.getUTCFullYear() - opts.years;
  const startDate = `${startYear}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const report: Report = [];
  const groups: { source: SeriesDef["source"]; key: string | undefined; run: (defs: SeriesDef[], key: string) => Promise<Obs[]> }[] = [
    { source: "bls", key: opts.keys.BLS_API_KEY, run: (d, k) => fetchBls(d, startYear, now.getUTCFullYear(), k, opts.doFetch) },
    { source: "fred", key: opts.keys.FRED_API_KEY, run: (d, k) => fetchFred(d, startDate, k, opts.doFetch) },
    { source: "eia", key: opts.keys.EIA_API_KEY, run: (d, k) => fetchEia(d, startDate, k, opts.doFetch) },
  ];
  for (const g of groups) {
    const defs = SERIES.filter((s) => s.source === g.source);
    if (!g.key) { for (const d of defs) report.push({ series: d.id, fetched: 0, error: `${g.source} key not set` }); continue; }
    // One series at a time for FRED/EIA so a single bad series cannot sink its neighbours; BLS is one batched query.
    const batches = g.source === "bls" ? [defs] : defs.map((d) => [d]);
    for (const batch of batches) {
      try {
        const obs = await g.run(batch, g.key);
        await opts.sink(batch.map(seriesMeta), obs);
        for (const d of batch) report.push({ series: d.id, fetched: obs.filter((o) => o.series_id === d.id).length });
      } catch (e) {
        for (const d of batch) report.push({ series: d.id, fetched: 0, error: e instanceof Error ? e.message : "error" });
      }
    }
  }
  return report;
}
