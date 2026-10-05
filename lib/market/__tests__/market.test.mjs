import test from "node:test";
import assert from "node:assert/strict";
import { shapeRow, pctChange } from "../snapshot.ts";
import { SERIES } from "../catalog.ts";
import { fetchBls } from "../sources.ts";

test("catalog: unique ids, every source covered, third-party series are not public", () => {
  assert.equal(new Set(SERIES.map((s) => s.id)).size, SERIES.length);
  assert.equal(SERIES.length, 19);
  for (const src of ["fred", "bls", "eia"]) assert.ok(SERIES.some((s) => s.source === src));
  for (const id of ["consumer_sentiment", "copper", "aluminum"]) assert.equal(SERIES.find((s) => s.id === id).public_ok, false);
  assert.ok(SERIES.filter((s) => s.public_ok).every((s) => s.license_note.length > 20));
});

test("pctChange rounds to two places and refuses a zero or missing base", () => {
  assert.equal(pctChange(110, 100), 10);
  assert.equal(pctChange(101.234, 100), 1.23);
  assert.equal(pctChange(5, 0), null);
  assert.equal(pctChange(5, null), null);
});

test("shapeRow produces exactly the public contract fields", () => {
  const s = shapeRow({ id: "cpi", title: "t", units: "u", frequency: "monthly", category: "Inflation", region: "US", source: "bls", source_series_id: "X", license_note: "n", public_ok: true,
    last_refreshed_at: null, latest_date: "2026-08-01", latest_value: "330.5", prior_year_date: "2025-08-01", prior_year_value: "321.5", prior_month_date: "2026-07-01", prior_month_value: "330" });
  assert.deepEqual(Object.keys(s).sort(), ["category", "frequency", "id", "latest", "mom_pct", "prior_year", "source", "title", "units", "yoy_pct"]);
  assert.deepEqual(s.latest, { date: "2026-08-01", value: 330.5 });
  assert.equal(s.yoy_pct, 2.8);
  assert.equal(s.mom_pct, 0.15);
});

test("BLS: parses monthly and quarterly periods, skips M13, sends the key only in the body", async () => {
  let seenUrl = "";
  const fake = async (url, init) => {
    seenUrl = String(url);
    return new Response(JSON.stringify({ status: "REQUEST_SUCCEEDED", Results: { series: [{ seriesID: "A", data: [
      { year: "2026", period: "M08", value: "1.5" }, { year: "2026", period: "M13", value: "9" }, { year: "2026", period: "Q02", value: "2.5" } ] }] } }));
  };
  const obs = await fetchBls([{ id: "a", source_series_id: "A" }], 2026, 2026, "k", fake);
  assert.deepEqual(obs.map((o) => o.obs_date), ["2026-08-01", "2026-06-01"]);
  assert.ok(!seenUrl.includes("k="));
});
