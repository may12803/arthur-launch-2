import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClientPortal } from "@/lib/client-portal/session";
import { Card, Eyebrow, PageTitle, Muted } from "@/components/client-portal/ui";
import { display, gradeTone, loadWorkstreams, ORDER, STATUS_LABEL, STATUS_TONE, type WsGrade } from "@/lib/client-portal/workstreams";
import { formatDate } from "@/lib/client-portal/format";

export const dynamic = "force-dynamic";

export default async function WorkstreamPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ctx = await requireClientPortal();
  const { supabase, workstreams, tasks } = await loadWorkstreams(ctx.tenantId);
  const w = workstreams.find((x) => x.key === key);
  if (!w) notFound();
  const { data: dims } = await supabase.from("workstream_grades").select("workstream_id, dimension, grade_start, grade_now, grade_target, sort").eq("workstream_id", w.id).order("sort").returns<WsGrade[]>();
  const mine = tasks.filter((t) => t.workstream_id === w.id);
  const need = mine.filter((t) => t.status === "needs_you").length;

  return (
    <div>
      <p className="text-[12px] text-[var(--muted)]"><Link href="/client/workstreams">Workstreams</Link> / <b className="font-medium text-[var(--ink)]">{w.name}</b></p>
      <div className="mt-4 grid items-end gap-8 md:grid-cols-[1.3fr_1fr]">
        <div>
          <PageTitle>{w.name}. <span className="text-[#8c8e95]">{mine.length} tasks{need ? `, ${need} need you` : ""}.</span></PageTitle>
          {w.summary && <Muted className="max-w-[56ch]">{w.summary}</Muted>}
        </div>
        <div className="flex gap-7">
          {[["At the start", w.grade_start], ["Now", w.grade_now], ["When done", w.grade_target]].map(([l, g]) => (
            <div key={l}><Eyebrow>{l}</Eyebrow><span className={`block text-[56px] font-medium leading-none tracking-[-0.04em] ${gradeTone(g)}`}>{display(g)}</span></div>
          ))}
        </div>
      </div>

      {dims && dims.length > 0 && (
        <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3">
          {dims.map((d) => (
            <Card key={d.dimension} className="p-5"><span className="text-[13px] text-[var(--muted)]">{d.dimension}</span><span className="mt-1 flex items-baseline gap-2 text-[13px] text-[var(--muted)]"><span className={`text-[28px] font-medium tracking-[-0.04em] ${gradeTone(d.grade_now)}`}>{display(d.grade_now)}</span>{d.grade_target && `→ ${display(d.grade_target)}`}</span></Card>
          ))}
        </div>
      )}

      {ORDER.map((s) => {
        const list = mine.filter((t) => t.status === s).sort((a, b) => a.rank - b.rank);
        if (!list.length) return null;
        return (
          <section key={s} className="mt-12">
            <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#777980]">{STATUS_LABEL[s]} <span className={`rounded-full px-2 py-0.5 text-[11px] normal-case tracking-normal ${STATUS_TONE[s]}`}>{list.length}</span></h3>
            <Card className={s === "done" ? "bg-[#fafbfd]" : ""}>
              {list.map((t, i) => (
                <Link key={t.id} href={`/client/workstreams/task/${t.id}`} className={`grid gap-2 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center ${i ? "border-t border-[var(--line)]" : ""}`}>
                  {s === "done" ? (
                    <span><span className="block text-[15px] text-[var(--ink)]">✓ {t.outcome}</span><span className="block text-[13px] text-[var(--muted)]">{t.was && `Was: ${t.was}. `}{t.proof && `Proof: ${t.proof}.`}</span></span>
                  ) : (
                    <span><span className="block text-[15px] font-medium text-[var(--ink)]">{t.title}</span>{t.detail && <span className="block text-[13px] text-[var(--muted)] line-clamp-2">{t.detail}</span>}</span>
                  )}
                  <span className="text-[12px] text-[var(--muted)]">{s === "done" ? (t.done_at ? formatDate(t.done_at) : "") : t.kind === "fix" ? <span className="rounded-full bg-[#fdecea] px-2.5 py-0.5 text-[11px] font-medium text-[#a1291f]">Fix now</span> : null}</span>
                </Link>
              ))}
            </Card>
          </section>
        );
      })}

      {w.review_slug && (
        <Card className="mt-12 flex items-center justify-between bg-[#f5f5f7] p-6">
          <span><Eyebrow>Deliverable</Eyebrow><span className="mt-1 block text-[16px] text-[var(--ink)]">The full {w.name} review</span><span className="text-[13px] text-[var(--muted)]">Findings, evidence and method</span></span>
          <Link href="/client" className="ll-secondary">Open</Link>
        </Card>
      )}
    </div>
  );
}
