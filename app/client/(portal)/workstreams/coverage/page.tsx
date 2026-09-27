import Link from "next/link";
import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { Card, Eyebrow, PageTitle, Muted, EmptyState } from "@/components/client-portal/ui";
import type { CoverageArea } from "@/lib/client-portal/workstreams";

export const dynamic = "force-dynamic";

const TONE = { reviewed: ["Reviewed", "bg-[#e6f4ea] text-[#1e6b3a]"], partial: ["Partly", "bg-[#fff4e0] text-[#8a5a00]"], none: ["Not yet", "bg-[#fdecea] text-[#a1291f]"] } as const;

// Every area the client's business runs on, reviewed or not, and the next reviews we propose by consequence,
// so the client never has to think of the next thing to look at.
export default async function CoveragePage() {
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const { data } = await supabase.from("coverage_areas").select("grp, area, status, note, rank, sort").order("sort").returns<CoverageArea[]>();
  const areas = data ?? [];
  if (!areas.length) return <EmptyState title="Coverage map coming" body="We're mapping every area your business runs on. It appears here with what we've reviewed and what we'd look at next." />;
  const n = (s: CoverageArea["status"]) => areas.filter((a) => a.status === s).length;
  const groups = [...new Set(areas.map((a) => a.grp))];
  const next = areas.filter((a) => a.rank).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 5);

  return (
    <div>
      <p className="text-[12px] text-[var(--muted)]"><Link href="/client/workstreams">Workstreams</Link> / <b className="font-medium text-[var(--ink)]">Coverage</b></p>
      <div className="mt-4"><Eyebrow>{ctx.tenantName} · Coverage</Eyebrow></div>
      <PageTitle>{areas.length} areas your business runs on. <span className="text-[#8c8e95]">{n("reviewed")} reviewed so far.</span></PageTitle>
      <Muted className="max-w-[60ch]">You shouldn&apos;t have to think of the next thing to look at. This map covers every area a business like yours depends on, what we&apos;ve reviewed, and what we&apos;d look at next.</Muted>
      <div className="mt-5 flex flex-wrap gap-3">{(["reviewed", "partial", "none"] as const).map((s) => <span key={s} className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${TONE[s][1]}`}>{TONE[s][0]} · {n(s)}</span>)}</div>

      <div className="mt-10 grid items-start gap-7 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-7">
          {groups.map((g) => (
            <div key={g}>
              <h3 className="mb-2.5 text-[13px] font-medium text-[var(--ink)]">{g}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {areas.filter((a) => a.grp === g).map((a) => (
                  <div key={a.area} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--line)] px-4 py-3">
                    <span><span className="block text-[14px] text-[var(--ink)]">{a.area}</span>{a.note && <span className="block text-[12px] text-[var(--muted)]">{a.note}</span>}</span>
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ${TONE[a.status][1]}`}>{TONE[a.status][0]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Card className="border-0 bg-[var(--ink)] p-6 text-white">
          <span className="ll-eyebrow !text-[#9ea3ad]">Next reviews we propose</span>
          <ol className="mt-4 grid gap-3">{next.map((a, i) => <li key={a.area} className="grid grid-cols-[22px_1fr] gap-2 text-[14px]"><span className="text-[#8e8d99]">{i + 1}</span><span>{a.area}{a.note && <span className="block text-[12px] text-[#8e8d99]">{a.note}</span>}</span></li>)}</ol>
          <p className="mt-5 text-[12.5px] text-[#8e8d99]">Tell us which to start, or approve it on the dashboard when it appears.</p>
        </Card>
      </div>
    </div>
  );
}
