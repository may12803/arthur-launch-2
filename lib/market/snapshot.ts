// Shapes market_snapshot_rows() into the public contract. Field names are consumed by the Snapshot feature; do not rename them.
export type SnapshotRow = {
  id: string; title: string; units: string; frequency: string; category: string; region: string; source: string; source_series_id: string;
  license_note: string | null; public_ok: boolean; last_refreshed_at: string | null;
  latest_date: string; latest_value: number | string;
  prior_year_date: string | null; prior_year_value: number | string | null;
  prior_month_date: string | null; prior_month_value: number | string | null;
};

export type SnapshotSeries = {
  id: string; title: string; units: string; frequency: string; category: string; source: string;
  latest: { date: string; value: number };
  prior_year: { date: string; value: number } | null;
  yoy_pct: number | null; mom_pct: number | null;
};

export function pctChange(now: number, then: number | null): number | null {
  if (then === null || !Number.isFinite(then) || then === 0) return null;
  return Math.round(((now - then) / Math.abs(then)) * 10000) / 100;
}

export function shapeRow(r: SnapshotRow): SnapshotSeries {
  const value = Number(r.latest_value);
  const py = r.prior_year_date && r.prior_year_value !== null ? { date: r.prior_year_date, value: Number(r.prior_year_value) } : null;
  const pm = r.prior_month_value !== null ? Number(r.prior_month_value) : null;
  return {
    id: r.id, title: r.title, units: r.units, frequency: r.frequency, category: r.category, source: r.source,
    latest: { date: r.latest_date, value },
    prior_year: py,
    yoy_pct: py ? pctChange(value, py.value) : null,
    mom_pct: pctChange(value, pm),
  };
}
