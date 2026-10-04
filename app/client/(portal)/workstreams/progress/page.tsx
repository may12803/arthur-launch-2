import Link from "next/link";
import { requireClientPortal } from "@/lib/client-portal/session";
import { Card, Eyebrow, PageTitle, Muted } from "@/components/client-portal/ui";
import { display, gradePoints, gradeTone, loadWorkstreams } from "@/lib/client-portal/workstreams";
import { LocalDate } from "@/components/client-portal/LocalTime";

export const dynamic = "force-dynamic";

// Every grade from the first review to today, and every finished task, newest first, with Was and Proof.
export default async function ProgressPage() {
  const ctx = await requireClientPortal();
  const { workstreams, tasks } = await loadWorkstreams(ctx.tenantId);
  const name = Object.fromEntries(workstreams.map((w) => [w.id, w.name]));
  const done = tasks.filter((t) => t.status === "done").sort((a, b) => String(b.done_at).localeCompare(String(a.done_at)));
  const pos = (g: string | null) => `${Math.max(0, gradePoints(g)) / 12 * 100}%`;
  const rows = [...workstreams].sort((a, b) => (gradePoints(b.grade_now) - gradePoints(b.grade_start)) - (gradePoints(a.grade_now) - gradePoints(a.grade_start)));

  return (
    <div>
      <p className="text-[12px] text-[var(--muted)]"><Link href="/client/workstreams">Workstreams</Link> / <b className="font-medium text-[var(--ink)]">Progress</b></p>
      <div className="mt-4"><Eyebrow>{ctx.tenantName} · Progress</Eyebrow></div>
      <PageTitle>What changed, <span className="text-[#8c8e95]">with proof.</span></PageTitle>
      <Muted className="max-w-[60ch]">Every grade from the first review to today, and every finished task with what was wrong and how we know it&apos;s fixed.</Muted>

      <Card className="mt-10">
        {rows.map((w, i) => {
          const moved = gradePoints(w.grade_now) - gradePoints(w.grade_start);
          return (
            <div key={w.id} className={`grid items-center gap-3 px-5 py-4 md:grid-cols-[220px_1fr_140px] ${i ? "border-t border-[var(--line)]" : ""}`}>
              <Link href={`/client/workstreams/${w.key}`} className="text-[15px] text-[var(--ink)]">{w.name}</Link>
              <div className="relative h-8"><span className="absolute inset-x-0 top-[15px] h-0.5 bg-[#eef0f3]" />
                {moved > 0 && <span className="absolute top-[15px] h-0.5 bg-[#1e6b3a]" style={{ left: pos(w.grade_start), width: `calc(${pos(w.grade_now)} - ${pos(w.grade_start)})` }} />}
                <span className="absolute top-1 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full bg-[#c9c3bd] text-[10px] font-semibold text-white" style={{ left: pos(w.grade_start) }}>{display(w.grade_start)}</span>
                {moved !== 0 && <span className={`absolute top-1 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full text-[10px] font-semibold text-white ${moved > 0 ? "bg-[#1e6b3a]" : "bg-[#a1291f]"}`} style={{ left: pos(w.grade_now) }}>{display(w.grade_now)}</span>}
              </div>
              <span className="text-[13px] text-[var(--muted)] md:text-right"><b className={`text-[20px] font-medium ${moved > 0 ? gradeTone("B") : "text-[var(--muted)]"}`}>{moved > 0 ? `+${moved}` : "0"}</b> {moved === 1 ? "step" : "steps"}</span>
            </div>
          );
        })}
      </Card>

      <section className="mt-14">
        <h2 className="mb-4 text-[24px] font-medium tracking-[-0.03em] text-[var(--ink)]">Completed <span className="ml-2 text-[14px] font-normal tracking-normal text-[var(--muted)]">{done.length} · newest first</span></h2>
        <Card>
          {done.length === 0 && <p className="px-5 py-6 text-[14px] text-[var(--muted)]">Nothing has been finished yet. Each task appears here with what was wrong, what changed and the proof, as soon as it is done.</p>}
          {done.map((t, i) => (
            <div key={t.id} className={`grid gap-2 px-5 py-4 md:grid-cols-[170px_1fr] ${i ? "border-t border-[var(--line)]" : ""}`}>
              <span className="self-start justify-self-start rounded-full bg-[#e6f4ea] px-2.5 py-0.5 text-[11px] font-medium text-[#1e6b3a]">✓ {name[t.workstream_id]}</span>
              <span><span className="block text-[15px] text-[var(--ink)]">{t.outcome}</span>{t.was && <span className="block text-[13px] text-[var(--muted)]">Was: {t.was}.</span>}{t.proof && <span className="block text-[12.5px] text-[#1e6b3a]">Proof: {t.proof}{t.done_at ? <> · <LocalDate iso={t.done_at} /></> : null}</span>}</span>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
