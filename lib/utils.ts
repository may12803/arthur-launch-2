// shadcn-style class merge utility. Minimal stub — combines class names
// without bringing in tailwind-merge / clsx deps. Sufficient for the 4
// importing files (calendar, inbox/EmailList, superlearner/DomainStats,
// communications/CommunicationsList).

export function cn(...inputs: (string | number | boolean | null | undefined | Record<string, boolean>)[]): string {
  const out: string[] = [];
  for (const x of inputs) {
    if (!x) continue;
    if (typeof x === "string") out.push(x);
    else if (typeof x === "number") out.push(String(x));
    else if (typeof x === "object") {
      for (const [k, v] of Object.entries(x)) if (v) out.push(k);
    }
  }
  return out.join(" ");
}
