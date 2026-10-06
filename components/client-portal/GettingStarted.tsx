import Link from "next/link";
import { Card } from "./ui";
import { activationSteps, type ActivationCounts } from "@/lib/client-portal/activation";

// First-login checklist on the home page: what to do next, from real counts, until every step is done.
export function GettingStarted({ counts, role }: { counts: ActivationCounts; role: string }) {
  const steps = activationSteps(counts, role);
  if (steps.every((s) => s.done)) return null;
  const done = steps.filter((s) => s.done).length;
  return (
    <Card className="p-6 mb-8">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="font-serif text-h3 text-text-active">Getting started</h2>
        <span className="text-[12.5px] text-text-muted">{done} of {steps.length} done</span>
      </div>
      <ol className="flex flex-col gap-3">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3">
            <span aria-hidden className={`mt-[3px] inline-block h-3.5 w-3.5 shrink-0 rounded-full border ${s.done ? "bg-[var(--ink)] border-[var(--ink)]" : "border-line-separator"}`} />
            <div className="min-w-0">
              <div className={`text-[14px] font-medium ${s.done ? "text-text-muted line-through" : "text-text-active"}`}>
                {s.done || !s.href ? s.title : <Link className="ll-text-link" href={s.href}>{s.title}</Link>}
              </div>
              <div className="text-[12.5px] text-text-muted">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
