import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClientPortal } from "@/lib/client-portal/session";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { Card, Eyebrow, Muted } from "@/components/client-portal/ui";
import { STATUS_LABEL, STATUS_TONE, type Workstream, type WsTask } from "@/lib/client-portal/workstreams";
import { formatDate } from "@/lib/client-portal/format";
import { DecisionForm } from "./DecisionForm";

export const dynamic = "force-dynamic";

type Decision = { decision: string; note: string | null; created_at: string };
const DECISION_LABEL: Record<string, string> = { approve: "Approved", approve_with_changes: "Approved with changes", not_now: "Not now" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireClientPortal();
  const supabase = await getLoveleedayServer();
  const { data: t } = await supabase.from("workstream_tasks").select("*").eq("id", id).maybeSingle<WsTask>();
  if (!t) notFound();
  const [{ data: w }, { data: decisions }] = await Promise.all([
    supabase.from("workstreams").select("key, name").eq("id", t.workstream_id).maybeSingle<Pick<Workstream, "key" | "name">>(),
    supabase.from("workstream_decisions").select("decision, note, created_at").eq("task_id", t.id).order("created_at", { ascending: false }).returns<Decision[]>(),
  ]);
  const canDecide = t.status !== "done" && ["owner", "admin", "member", "staff"].includes(ctx.role ?? "");
  const steps = [
    ["You approve", "The task moves to In progress."],
    ["We make the change", "Usually the same day."],
    ["We verify it live", "We re-read the system and attach the proof."],
    ["Done, and the grade updates", "The task drops into Done with what was wrong and how we know it's fixed."],
  ];

  return (
    <div>
      <p className="text-[12px] text-[var(--muted)]"><Link href="/client/workstreams">Workstreams</Link> / {w && <Link href={`/client/workstreams/${w.key}`}>{w.name}</Link>}</p>
      <div className="mt-4 flex items-center gap-2"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${t.kind === "fix" && t.status !== "done" ? "bg-[#fdecea] text-[#a1291f]" : STATUS_TONE[t.status]}`}>{t.kind === "fix" && t.status !== "done" ? "Fix now" : STATUS_LABEL[t.status]}</span></div>
      <h1 className="ll-title !mt-3 !text-[40px] max-md:!text-[30px]">{t.status === "done" ? `✓ ${t.outcome}` : t.title}</h1>
      {t.status === "done" ? (
        <Muted className="max-w-[64ch]">{t.was && `Was: ${t.was}. `}{t.proof && `Proof: ${t.proof}.`}</Muted>
      ) : t.detail && <Muted className="max-w-[64ch]">{t.detail}</Muted>}

      <div className="mt-10 grid items-start gap-7 md:grid-cols-[1.35fr_1fr]">
        <Card className="p-6">
          {t.evidence && (
            <>
              <Eyebrow>The evidence</Eyebrow>
              <table className="mt-3 w-full text-[13.5px]">
                <thead><tr>{t.evidence.columns.map((c) => <th key={c} className="border-b border-[var(--line)] py-2 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8c8e95]">{c}</th>)}</tr></thead>
                <tbody>{t.evidence.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`border-b border-[#eef0f3] py-2 ${j === r.length - 1 ? "font-medium text-[#a1291f]" : ""}`}>{c}</td>)}</tr>)}</tbody>
              </table>
              {t.evidence.note && <p className="mt-3 text-[13px] text-[var(--muted)]">{t.evidence.note}</p>}
            </>
          )}
          <div className={t.evidence ? "mt-7" : ""}><Eyebrow>What we recommend</Eyebrow><p className="mt-2 text-[15px] leading-[1.65] text-[#303238]">{t.recommendation || t.detail || "We'll walk you through it."}</p></div>
        </Card>
        <Card className="p-6">
          {canDecide ? <DecisionForm taskId={t.id} /> : <><Eyebrow>Status</Eyebrow><p className="mt-2 text-[15px] text-[var(--ink)]">{STATUS_LABEL[t.status]}{t.done_at ? ` · ${formatDate(t.done_at)}` : ""}</p></>}
          {decisions && decisions.length > 0 && (
            <div className="mt-6"><Eyebrow>Decisions</Eyebrow>{decisions.map((d) => <p key={d.created_at} className="mt-2 text-[13.5px] text-[#303238]">{DECISION_LABEL[d.decision]} · {formatDate(d.created_at)}{d.note && <span className="block text-[var(--muted)]">“{d.note}”</span>}</p>)}</div>
          )}
          <div className="mt-7"><Eyebrow>What happens next</Eyebrow>
            <ol className="mt-3 grid gap-3">{steps.map(([a, b], i) => <li key={a} className="grid grid-cols-[26px_1fr] gap-3"><span className={`grid h-[26px] w-[26px] place-items-center rounded-full text-[12px] font-medium ${i === 0 ? "bg-[var(--ink)] text-white" : "bg-[#eef0f3] text-[var(--ink)]"}`}>{i + 1}</span><span><span className="block text-[14.5px] text-[var(--ink)]">{a}</span><span className="block text-[13px] text-[var(--muted)]">{b}</span></span></li>)}</ol>
          </div>
        </Card>
      </div>
    </div>
  );
}
