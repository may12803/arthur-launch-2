#!/usr/bin/env node
// 10-year backfill of every market series into Supabase (loveleeday project), then a per-series row-count report. Idempotent.
//   arthur-cred run --use market-data,supabase -- node scripts/market-backfill.mjs [--years=10]
// Writes through the Supabase Management API SQL endpoint (SUPABASE_ACCESS_TOKEN), so it needs no connectors secret.
import { refreshMarket } from "../lib/market/refresh.ts";

const REF = "eydcfgoklajcztpoprsl";
const years = Number((process.argv.find((a) => a.startsWith("--years=")) || "--years=10").split("=")[1]);
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error("SUPABASE_ACCESS_TOKEN not set (run via arthur-cred run --use market-data,supabase)"); process.exit(2); }

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL HTTP ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}
const lit = (o) => `$j$${JSON.stringify(o)}$j$::jsonb`;

const sink = async (series, obs) => {
  await sql(`insert into public.market_series (id, source, source_series_id, title, units, frequency, category, region, license_note, public_ok, last_refreshed_at)
    select s.id, s.source, s.source_series_id, s.title, s.units, s.frequency, s.category, s.region, s.license_note, s.public_ok, now()
    from jsonb_to_recordset(${lit(series)}) as s(id text, source text, source_series_id text, title text, units text, frequency text, category text, region text, license_note text, public_ok boolean)
    on conflict (id) do update set source = excluded.source, source_series_id = excluded.source_series_id, title = excluded.title, units = excluded.units, frequency = excluded.frequency,
      category = excluded.category, region = excluded.region, license_note = excluded.license_note, public_ok = excluded.public_ok, last_refreshed_at = now()`);
  for (let i = 0; i < obs.length; i += 2500) {
    await sql(`insert into public.market_observations (series_id, obs_date, value, fetched_at)
      select o.series_id, o.obs_date, o.value, now() from jsonb_to_recordset(${lit(obs.slice(i, i + 2500))}) as o(series_id text, obs_date date, value numeric)
      on conflict (series_id, obs_date) do update set value = excluded.value, fetched_at = now() where public.market_observations.value is distinct from excluded.value`);
  }
};

const report = await refreshMarket({ years, keys: process.env, sink });
for (const r of report) console.log(`${r.series.padEnd(24)} fetched ${String(r.fetched).padStart(5)}${r.error ? "  ERROR " + r.error : ""}`);
const counts = await sql(`select s.id, s.source, s.public_ok, count(o.*)::int as rows, min(o.obs_date) as first, max(o.obs_date) as last from public.market_series s left join public.market_observations o on o.series_id = s.id group by s.id, s.source, s.public_ok order by s.id`);
console.log("\nrows in database:");
for (const c of counts) console.log(`${c.id.padEnd(24)} ${c.source.padEnd(5)} public=${c.public_ok}  ${String(c.rows).padStart(5)} rows  ${c.first} .. ${c.last}`);
process.exit(report.some((r) => r.error) ? 1 : 0);
