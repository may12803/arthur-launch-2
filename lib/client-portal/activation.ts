// The first-login path, derived from real tenant counts: connect a source, see one picture, invite the team, review alerts.
export type ActivationCounts = { connections: number; uploads: number; documents: number; teammates: number; approvals: number };
export type ActivationStep = { key: string; title: string; body: string; href: string | null; done: boolean };

export function activationSteps(c: ActivationCounts, role: string): ActivationStep[] {
  const admin = role === "owner" || role === "admin" || role === "staff";
  const canWrite = admin || role === "member";
  return [
    {
      key: "source", title: "Connect your first system or upload a file",
      body: canWrite ? "Accounting, CRM, payroll, a student or property system, or a spreadsheet export. Read-only access." : "An owner or admin connects your systems. Ask them to start here.",
      href: canWrite ? "/client/connections" : null, done: c.connections + c.uploads > 0,
    },
    {
      key: "documents", title: "Share the documents behind your numbers",
      body: "Contracts, policies, filings and reports, so every figure can point to its source.",
      href: canWrite ? "/client/documents" : null, done: c.documents > 0,
    },
    {
      key: "team", title: "Invite the people who need answers",
      body: admin ? "Finance, operations, your accountant or board. Give each the role that fits." : "An owner or admin invites teammates.",
      href: admin ? "/client/team" : null, done: c.teammates > 1,
    },
    {
      key: "review", title: "Review what needs your decision",
      body: "Anything LOVELEEDAY proposes to send, pay or change waits here for a person to approve.",
      href: "/client/approvals", done: c.approvals > 0,
    },
  ];
}
