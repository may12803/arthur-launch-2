"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LocalTime } from "../LocalTime";
import { Notice, Pill } from "../cp";

export type Approval = {
  id: string;
  entity_id: string | null;
  gate: "auto" | "money" | "send" | "legal";
  title: string;
  detail: string | null;
  proposed: Record<string, unknown> | null;
  source_ref: string | null;
  status: "pending" | "approved" | "rejected" | "edited" | "expired";
  decided_by: string | null;
  decided_at: string | null;
  reason: string | null;
  proof: string | null;
  created_at: string;
};

function canDecideGate(role: string, gate: string): boolean {
  if (role === "owner" || role === "admin") return true;
  return role === "member" && (gate === "send" || gate === "auto");
}

const GATES = [
  { id: "money", label: "Money", chip: "MNY", blurb: "Moves or commits money", tone: "wait" },
  { id: "send", label: "Send", chip: "SND", blurb: "Sends a message outside the company", tone: "info" },
  { id: "legal", label: "Legal", chip: "LGL", blurb: "Binds or commits you", tone: "off" },
  { id: "auto", label: "Automatic", chip: "AUT", blurb: "Runs without a person, always logged", tone: "good" },
] as const;

const chipStyle: Record<string, string> = { money: "bg-[#fdf8f2] text-[#8a4b1d] border-[#eedcc8]", send: "bg-[#f0f5fc] text-[#3970af] border-[#d8e6f8]", legal: "bg-[#f4f1fb] text-[#5b4a93] border-[#e0d9f2]", auto: "bg-[#f3faf6] text-[#2f6b4f] border-[#cfe3d8]" };

function Evidence({ proposed }: { proposed: Record<string, unknown> | null }) {
  const entries = Object.entries(proposed ?? {}).filter(([, v]) => v != null && typeof v !== "object").slice(0, 12);
  if (!entries.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)]">
      <table className="cp-table">
        <thead><tr><th>Field</th><th>Proposed value</th></tr></thead>
        <tbody>{entries.map(([k, v]) => <tr key={k}><td className="text-[12px] text-[var(--muted)]">{k.replace(/_/g, " ")}</td><td className="cp-mono text-[12px] break-words">{String(v)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Card({ a, canDecide, open, onToggle, onDone }: { a: Approval; canDecide: boolean; open: boolean; onToggle: () => void; onDone: (msg: string) => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "edit" | "reject">("none");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const gate = GATES.find((g) => g.id === a.gate)!;
  const pending = a.status === "pending";

  async function decide(decision: "approve" | "reject" | "edit") {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/client/approvals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: a.id, decision, reason: decision === "reject" ? text : undefined, edit: decision === "edit" ? { note: text } : undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "That did not save."); setBusy(false); return; }
      onDone(decision === "approve" ? "Approved. It closes only when the result is observed in your systems." : decision === "reject" ? "Rejected. The reason is kept with the record." : "Your change was recorded and sent back for a new proposal.");
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "That did not save."); }
    setBusy(false);
  }

  return (
    <article className={`rounded-2xl border bg-white ${open ? "border-[var(--ink)] shadow-[0_1px_0_#0000000d]" : "border-[var(--line)]"}`}>
      <button type="button" className="flex w-full items-center gap-4 p-4 text-left max-sm:flex-wrap max-sm:items-start" onClick={onToggle} aria-expanded={open}>
        <span className={`inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg border text-[10px] font-semibold tracking-[.04em] ${chipStyle[a.gate]}`}>{gate.chip}</span>
        <span className="min-w-0 flex-1 max-sm:basis-[calc(100%-52px)]">
          <span className="block text-[15px] font-medium leading-snug tracking-[-0.01em] text-[var(--ink)]">{a.title}</span>
          <span className="mt-0.5 block text-[12.5px] leading-[1.55] text-[var(--muted)]">{a.detail ?? gate.blurb}</span>
        </span>
        <span className="flex flex-none flex-col items-end gap-1.5 max-sm:w-full max-sm:flex-row max-sm:items-center max-sm:justify-between max-sm:pl-[52px]">
          {pending ? <Pill tone="wait">Needs a decision</Pill> : <Pill tone={a.status === "approved" ? (a.proof ? "good" : "info") : a.status === "rejected" ? "bad" : "off"}>{a.status === "approved" ? (a.proof ? "Closed with proof" : "Approved, awaiting proof") : a.status.charAt(0).toUpperCase() + a.status.slice(1)}</Pill>}
          <span className="text-[11px] text-[var(--muted)]"><LocalTime iso={a.created_at} /></span>
        </span>
      </button>

      {open ? (
        <div className="border-t border-[#edf0f4] p-5">
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="grid gap-4">
              <Evidence proposed={a.proposed} />
              {a.source_ref ? <p className="text-[12px] text-[var(--muted)]">Source: <span className="cp-mono">{a.source_ref}</span></p> : null}
              {!pending && a.reason ? <p className="text-[13px] text-[#303238]"><span className="cp-cap mr-2">Reason</span>{a.reason}</p> : null}
              {a.proof ? <div><span className="cp-cap">Proof of closure</span><p className="cp-copy mt-1.5 !border-[#cfe3d8] !bg-[#f3faf6] !text-[#2f6b4f]">{a.proof}</p></div> : a.status === "approved" ? <Notice tone="info"><div>Approved. This closes when the result is observed in the source system, and the proof appears here.</div></Notice> : null}
            </div>
            <div className="rounded-xl bg-[#fafbfd] p-4 text-[12.5px] leading-[1.65] text-[#4a4f58]">
              <span className="cp-cap">What approving does</span>
              <p className="mt-1.5">{a.gate === "auto" ? "Automatic items already ran. They are here so you can see what happened." : `Nothing ${a.gate === "money" ? "moves money" : a.gate === "send" ? "is sent" : "is signed"} until a person says yes. Your decision is recorded in the audit trail with your name.`}</p>
            </div>
          </div>

          {pending && a.gate !== "auto" ? (
            canDecide ? (
              <div className="mt-5 grid gap-3">
                {mode !== "none" ? (
                  <label className="ll-field">
                    <span>{mode === "reject" ? "Reason for rejecting (required)" : "What should change?"}</span>
                    <textarea className="ll-input min-h-[84px]" value={text} onChange={(e) => setText(e.target.value)} />
                  </label>
                ) : null}
                <div className="flex flex-wrap items-center gap-2.5">
                  {mode === "none" ? (
                    <>
                      <button type="button" className="ll-primary !bg-[#2f6b4f]" disabled={busy} onClick={() => decide("approve")}>{busy ? "Saving..." : "Approve"}</button>
                      <button type="button" className="ll-secondary" onClick={() => setMode("edit")}>Edit</button>
                      <button type="button" className="ll-danger" onClick={() => setMode("reject")}>Reject</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className={mode === "reject" ? "ll-danger" : "ll-primary"} disabled={busy || text.trim().length < 3} onClick={() => decide(mode === "reject" ? "reject" : "edit")}>{busy ? "Saving..." : mode === "reject" ? "Reject with reason" : "Send change"}</button>
                      <button type="button" className="ll-secondary" disabled={busy} onClick={() => { setMode("none"); setText(""); }}>Cancel</button>
                    </>
                  )}
                </div>
                {err ? <p role="alert" className="text-[13px] text-[#a1291f]">{err}</p> : null}
              </div>
            ) : (
              <p className="mt-5 text-[12.5px] text-[var(--muted)]">You have read-only access, so you can see this but not decide it. Ask an owner, admin or member to review.</p>
            )
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ApprovalsView({ approvals, role }: { approvals: Approval[]; role: string }) {
  const [view, setView] = useState<"pending" | "decided">("pending");
  const [gate, setGate] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(approvals.find((a) => a.status === "pending")?.id ?? null);
  const [flash, setFlash] = useState<string | null>(null);

  const pendingAll = approvals.filter((a) => a.status === "pending");
  const decidedAll = approvals.filter((a) => a.status !== "pending");
  const pool = view === "pending" ? pendingAll : decidedAll;
  const shown = pool.filter((a) => gate === "all" || a.gate === gate);
  const count = (g: string) => pool.filter((a) => a.gate === g).length;
  const groups = useMemo(() => GATES.filter((g) => shown.some((a) => a.gate === g.id)), [shown]);

  return (
    <div className="cp-split">
      <nav className="cp-subnav" aria-label="Approval filters">
        {[{ id: "pending", label: "Needs my decision", n: pendingAll.length }, { id: "decided", label: "Decided", n: decidedAll.length }].map((v) => (
          <button key={v.id} type="button" onClick={() => setView(v.id as "pending" | "decided")} aria-current={view === v.id ? "page" : undefined}>
            <span>{v.label}</span><span className="rounded-full bg-white px-2 text-[11px] text-[var(--muted)] ring-1 ring-[var(--line)]">{v.n}</span>
          </button>
        ))}
        <span className="cp-cap px-3 pb-1.5 pt-4 max-md:hidden">Gate</span>
        {[{ id: "all", label: "All gates", n: pool.length }, ...GATES.map((g) => ({ id: g.id, label: g.label, n: count(g.id) }))].map((g) => (
          <button key={g.id} type="button" onClick={() => setGate(g.id)} aria-current={gate === g.id ? "page" : undefined}>
            <span>{g.label}</span><span className="text-[11px] text-[var(--muted)]">{g.n}</span>
          </button>
        ))}
      </nav>

      <div className="min-w-0 grid gap-8">
        {flash ? <Notice tone="good"><div>{flash}</div></Notice> : null}
        {role === "viewer" ? <Notice tone="info"><div>You have read-only access. You can see every approval and its proof, but only owners, admins and members can decide.</div></Notice> : role === "member" ? <Notice tone="info"><div>Money and legal decisions need an owner or admin. You can decide send items.</div></Notice> : null}
        {!shown.length ? (
          <div className="rounded-2xl border border-[var(--line)] p-10 text-center">
            <p className="text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)]">{view === "pending" ? "Nothing is waiting on you" : "No decisions recorded yet"}</p>
            <p className="mx-auto mt-2 max-w-[46ch] text-[15px] leading-[1.7] text-[var(--muted)]">{view === "pending" ? "When we prepare work that moves money, sends a message or binds you, it stops here for a person to say yes." : "Approved, edited and rejected items stay here with their reason and proof."}</p>
          </div>
        ) : groups.map((g) => (
          <div key={g.id} aria-labelledby={`gate-${g.id}`}>
            <h2 id={`gate-${g.id}`} className="mb-3 flex items-center gap-3 text-[17px] font-medium tracking-[-0.02em] text-[var(--ink)]">
              <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[10px] font-semibold ${chipStyle[g.id]}`}>{g.label[0]}</span>
              {g.label}
              <span className="text-[12px] font-normal text-[var(--muted)]">{shown.filter((a) => a.gate === g.id).length} {view === "pending" ? "pending" : "decided"} · {g.blurb}</span>
            </h2>
            <div className="grid gap-3">
              {shown.filter((a) => a.gate === g.id).map((a) => (
                <Card key={a.id} a={a} canDecide={canDecideGate(role, a.gate)} open={openId === a.id} onToggle={() => setOpenId(openId === a.id ? null : a.id)} onDone={setFlash} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
