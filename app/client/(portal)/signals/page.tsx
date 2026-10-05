import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { ErrorBanner, Notice, PageHead, Panel, PanelHead, Pill, TableWrap } from "@/components/client-portal/cp";
import { Sparkline } from "@/components/client-portal/Sparkline";
import { shapeRow, type SnapshotRow } from "@/lib/market/snapshot";

export const dynamic = "force-dynamic";

const SOURCE_NAME: Record<string, string> = { fred: "FRED, Federal Reserve Bank of St. Louis", bls: "U.S. Bureau of Labor Statistics", eia: "U.S. Energy Information Administration" };
const CATEGORY_ORDER = ["Inflation", "Labor", "Rates and dollar", "Activity", "Energy", "Metals"];

function fmtValue(v: number): string {
  const abs = Math.abs(v);
  return v.toLocaleString("en-US", { minimumFractionDigits: abs >= 1000 ? 0 : 2, maximumFractionDigits: abs >= 1000 ? 0 : 2 });
}
function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function fmtPct(p: number | null): string {
  if (p === null) return "n/a";
  return `${p > 0 ? "+" : ""}${p.toFixed(2)}%`;
}

export default async function SignalsPage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const [rows, spark] = await Promise.all([
    supabase.rpc("market_snapshot_rows"),
    supabase.rpc("market_sparklines", { p_months: 120 }),
  ]);
  const series = ((rows.data ?? []) as SnapshotRow[]).map((r) => ({ row: r, s: shapeRow(r) }));
  const sparks = new Map<string, [string, number][]>(((spark.data ?? []) as { series_id: string; points: [string, number][] }[]).map((p) => [p.series_id, p.points]));
  const categories = [...new Set(series.map((x) => x.s.category))].sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99));
  const refreshed = series.map((x) => x.row.last_refreshed_at).filter((d): d is string => !!d).sort().pop();

  return (
    <div>
      <PageHead
        eyebrow={`${ctx.tenantName} · Signals`}
        title="The economy"
        muted="your costs move with."
        lead="Official prices, rates and energy costs from the agencies that publish them. Every number shows its source and the date it describes, not the date we fetched it."
      />
      <ErrorBanner label="Market data did not load" errors={[rows.error && `Series: ${rows.error.message}`, spark.error && `History: ${spark.error.message}`]} />
      {!rows.error && series.length === 0 ? <Notice tone="wait">No market data has been loaded yet. The daily refresh fills this in.</Notice> : null}
      <div className="grid gap-6">
        {categories.map((cat) => (
          <Panel key={cat}>
            <PanelHead title={cat} sub={`${series.filter((x) => x.s.category === cat).length} series`} />
            <TableWrap>
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>Series</th>
                    <th className="num">Latest</th>
                    <th className="num">Year over year</th>
                    <th>10 years</th>
                    <th>Source and as of</th>
                  </tr>
                </thead>
                <tbody>
                  {series.filter((x) => x.s.category === cat).map(({ row, s }) => (
                    <tr key={s.id}>
                      <td>
                        <b>{s.title}</b>
                        <span className="sub">{s.units}{row.region !== "US" ? ` · ${row.region}` : ""}</span>
                      </td>
                      <td className="num"><b>{fmtValue(s.latest.value)}</b></td>
                      <td className="num">{fmtPct(s.yoy_pct)}{s.prior_year ? <span className="sub">vs {fmtDate(s.prior_year.date)}</span> : null}</td>
                      <td><Sparkline points={sparks.get(s.id) ?? []} label={s.title} /></td>
                      <td>
                        {SOURCE_NAME[s.source] ?? s.source}
                        <span className="sub">As of {fmtDate(s.latest.date)} · {row.source_series_id}</span>
                        {!row.public_ok ? <span className="sub"><Pill tone="off">Signed-in clients only</Pill></span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Panel>
        ))}
      </div>
      <p className="mt-6 text-[12px] text-[var(--muted)]">
        {refreshed ? `Last refreshed ${new Date(refreshed).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })} ET. ` : ""}
        Sparklines show month-end values. Consumer sentiment (University of Michigan) and metals (International Monetary Fund) are third-party copyright, reprinted with permission, and are not redistributed publicly. This product uses the FRED API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.
      </p>
    </div>
  );
}
