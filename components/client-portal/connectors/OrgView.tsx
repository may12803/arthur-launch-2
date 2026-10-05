import Link from "next/link";
import { Panel, PanelHead, Pill, Stat } from "../cp";

export type OrgProps = {
  name: string;
  status: string;
  role: string;
  retentionDays: number | null;
  sessionHours: number | null;
  entityCount: number;
  memberCount: number | null;
  connectionCount: number;
  admin: boolean;
};

// Organization profile. The company name and status are read from the account; changing the legal name goes through
// LOVELEEDAY because contracts and invoices carry it. Retention and session length live in the Security center.
export function OrgView(p: OrgProps) {
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Members" value={p.memberCount ?? "-"} sub={<Link href="/client/team" className="text-[var(--blue)]">Manage team</Link>} />
        <Stat label="Entities and locations" value={p.entityCount} sub={<Link href="/client/organization/entities" className="text-[var(--blue)]">Edit structure</Link>} />
        <Stat label="Connected systems" value={p.connectionCount} sub={<Link href="/client/connections" className="text-[var(--blue)]">View connectors</Link>} />
        <Stat label="Data retention" value={p.retentionDays != null ? `${p.retentionDays} days` : "-"} sub={p.retentionDays != null ? "Set in the Security center" : "Not set yet"} />
      </div>

      <Panel>
        <PanelHead title="Profile" sub="How your company appears on contracts, invoices and shared documents." />
        <dl className="cp-panel-b grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <div><dt className="cp-cap">Company</dt><dd className="mt-1.5 text-[16px] font-medium text-[var(--ink)]">{p.name}</dd></div>
          <div><dt className="cp-cap">Account status</dt><dd className="mt-1.5"><Pill tone={p.status === "active" ? "good" : "wait"} dot>{p.status.charAt(0).toUpperCase() + p.status.slice(1)}</Pill></dd></div>
          <div><dt className="cp-cap">Your role</dt><dd className="mt-1.5 text-[14px] capitalize text-[#303238]">{p.role}</dd></div>
          <div><dt className="cp-cap">Session length</dt><dd className="mt-1.5 text-[14px] text-[#303238]">{p.sessionHours != null ? `${p.sessionHours} hours` : "Default"}</dd></div>
        </dl>
        <p className="border-t border-[#edf0f4] px-6 py-4 text-[12.5px] leading-[1.7] text-[var(--muted)] max-sm:px-4">
          To change the legal company name, contact your LOVELEEDAY lead; it appears on signed contracts. {p.admin ? <>Retention and session rules are in the <Link href="/client/security" className="text-[var(--blue)]">Security center</Link>.</> : null}
        </p>
      </Panel>
    </div>
  );
}
