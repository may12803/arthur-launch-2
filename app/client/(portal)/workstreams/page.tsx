import Link from "next/link";
import { requireClientPortal } from "@/lib/client-portal/session";
import { Card, Eyebrow, PageTitle, Muted, EmptyState } from "@/components/client-portal/ui";
import { averageGrade, display, gradeTone, loadWorkstreams } from "@/lib/client-portal/workstreams";
import { formatDate } from "@/lib/client-portal/format";

export const dynamic = "force-dynamic";

// The one page: every area graded start → now, the decisions that matter most, finished work at the bottom.
export default async function WorkstreamsPage() {
  const ctx = await requireClientPortal();
  const { workstreams, tasks, error } = await loadWorkstreams();
  if (error) return <Card className="p-5 border-red-200"><p className="text-small text-red-700">Couldn&apos;t load workstreams: {error}</p></Card>;
  if (!workstreams.length) return <EmptyState title="No workstreams yet" body="When LOVELEEDAY starts improving an area of your business, it appears here with its grade and every task." />;

  const done = tasks.filter((t) => t.status === "done");
  const needs = tasks.filter((t) => t.status === "needs_you").sort((a, b) => a.rank - b.rank);
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const pct = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
  const start = averageGrade(workstreams.map((w) => w.grade_start));
  const now = averageGrade(workstreams.map((w) => w.grade_now));
  const target = averageGrade(workstreams.map((w) => w.grade_target));
  const wsName = Object.fromEntries(workstreams.map((w) => [w.id, w]));
  const recent = [...done].sort((a, b) => String(b.done_at).localeCompare(String(a.done_at))).slice(0, 3);

  return (
    <div>
      <Eyebrow>{ctx.tenantName} · Engagement</Eyebrow>
      <PageTitle>Everything in motion. <span className="text-[#8c8e95]">One page.</span></PageTitle>
      <Muted className="max-w-[60ch]">Every area we&apos;re improving, graded when we started and graded now. Decisions that need you come first; finished work sinks to the bottom.</Muted>

      <div className="mt-10 grid gap-5 md:grid-cols-[1.15fr_1fr]">
        <Card className="flex items-center gap-7 p-7">
          <div className="grid h-[112px] w-[112px] flex-none place-items-center rounded-full" style={{ background: `conic-gradient(var(--ink) ${pct}%, #eef0f3 0)` }}>
            <div className="grid h-[88px] w-[88px] place-items-center rounded-full bg-white text-center"><span className="text-[24px] font-medium tracking-[-0.03em] text-[var(--ink)]">{pct}%<span className="block text-[10px] font-semibold tracking-[0.1em] text-[var(--muted)]">DONE</span></span></div>
          </div>
          <div>
            <Eyebrow>Overall grade</Eyebrow>
            <div className="mt-1 text-[44px] font-medium tracking-[-0.04em]"><span className={gradeTone(start)}>{display(start)}</span><span className="mx-2 text-[16px] text-[var(--muted)]">→</span><span className={gradeTone(now)}>{display(now)}</span></div>
            <Muted>at the start → today · <b className="font-medium text-[var(--ink)]">{display(target)}</b> when the open work is done</Muted>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          {[[`${done.length}`, `of ${tasks.length} tasks done`], [`${needs.length}`, "need your decision"], [`${inProgress}`, "in progress"], [`${workstreams.length}`, "areas in motion"]].map(([v, l]) => (
            <div key={l} className="rounded-2xl bg-[#f5f5f7] p-5"><b className="block text-[30px] font-medium tracking-[-0.03em] text-[var(--ink)]">{v}</b><span className="text-[13px] text-[var(--muted)]">{l}</span></div>
          ))}
        </div>
      </div>

      {needs.length > 0 && (
        <section className="mt-14">
          <div className="mb-4 flex items-baseline justify-between"><h2 className="text-[24px] font-medium tracking-[-0.03em] text-[var(--ink)]">Needs your decision <span className="ml-2 text-[14px] font-normal tracking-normal text-[var(--muted)]">{Math.min(5, needs.length)} of {needs.length} · by consequence</span></h2></div>
          <Card>
            {needs.slice(0, 5).map((t, i) => (
              <Link key={t.id} href={`/client/workstreams/task/${t.id}`} className={`grid gap-3 px-5 py-4 md:grid-cols-[150px_1fr_auto] md:items-center ${i ? "border-t border-[var(--line)]" : ""}`}>
                <span className={`justify-self-start rounded-full px-2.5 py-0.5 text-[11px] font-medium ${t.kind === "fix" ? "bg-[#fdecea] text-[#a1291f]" : "bg-[#edf3fc] text-[#2d6aa8]"}`}>{wsName[t.workstream_id]?.name}</span>
                <span><span className="block text-[15px] font-medium text-[var(--ink)]">{t.title}</span>{t.detail && <span className="block text-[13px] text-[var(--muted)] line-clamp-1">{t.detail}</span>}</span>
                <span className="ll-primary justify-self-start !px-4 !py-2 text-[12.5px]">Review</span>
              </Link>
            ))}
          </Card>
        </section>
      )}

      <section className="mt-14">
        <div className="mb-4 flex items-baseline justify-between"><h2 className="text-[24px] font-medium tracking-[-0.03em] text-[var(--ink)]">Workstreams <span className="ml-2 text-[14px] font-normal tracking-normal text-[var(--muted)]">{workstreams.length}</span></h2><Link href="/client/workstreams/coverage" className="text-[12.5px] text-[var(--blue)]">Coverage of your whole business →</Link></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {workstreams.map((w) => {
            const mine = tasks.filter((t) => t.workstream_id === w.id);
            const d = mine.filter((t) => t.status === "done").length;
            const n = mine.filter((t) => t.status === "needs_you").length;
            return (
              <Link key={w.id} href={`/client/workstreams/${w.key}`}>
                <Card className="flex h-full flex-col gap-3 p-5 transition-colors hover:border-[#c9ccd3]">
                  <span className="text-[15px] font-medium text-[var(--ink)]">{w.name}</span>
                  <span className="text-[30px] font-medium tracking-[-0.04em]"><span className={gradeTone(w.grade_start)}>{display(w.grade_start)}</span><span className="mx-1.5 text-[13px] text-[var(--muted)]">→</span><span className={gradeTone(w.grade_now)}>{display(w.grade_now)}</span></span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-[#eef0f3]"><span className="block h-full rounded-full bg-[var(--ink)]" style={{ width: `${mine.length ? (d / mine.length) * 100 : 0}%` }} /></span>
                  <span className="flex flex-wrap justify-between gap-x-3 text-[12px] text-[var(--muted)]"><span>{d} of {mine.length} done</span><span>{n ? `${n} need you` : "nothing waiting"}</span></span>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="mt-14">
          <div className="mb-4 flex items-baseline justify-between"><h2 className="text-[24px] font-medium tracking-[-0.03em] text-[var(--ink)]">Recently completed <span className="ml-2 text-[14px] font-normal tracking-normal text-[var(--muted)]">with proof</span></h2><Link href="/client/workstreams/progress" className="text-[12.5px] text-[var(--blue)]">All {done.length} →</Link></div>
          <Card>
            {recent.map((t, i) => (
              <div key={t.id} className={`grid gap-2 px-5 py-4 md:grid-cols-[150px_1fr_auto] ${i ? "border-t border-[var(--line)]" : ""}`}>
                <span className="justify-self-start rounded-full bg-[#e6f4ea] px-2.5 py-0.5 text-[11px] font-medium text-[#1e6b3a]">✓ {wsName[t.workstream_id]?.name}</span>
                <span><span className="block text-[14.5px] text-[var(--ink)]">{t.outcome}</span><span className="block text-[12.5px] text-[var(--muted)]">{t.was && `Was: ${t.was}. `}{t.proof && `Proof: ${t.proof}.`}</span></span>
                <span className="text-[12px] text-[var(--muted)]">{t.done_at ? formatDate(t.done_at) : ""}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
