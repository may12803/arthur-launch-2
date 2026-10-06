import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/client-portal/PortalShell";
import { buildCatalog, type ConnRow, type SyncRun } from "@/lib/client-portal/connector-ui";
import { CatalogView } from "@/components/client-portal/connectors/CatalogView";
import { DetailView } from "@/components/client-portal/connectors/DetailView";
import { UploadView } from "@/components/client-portal/connectors/UploadView";
import { HealthView } from "@/components/client-portal/connectors/HealthView";
import { ApprovalsView, type Approval } from "@/components/client-portal/connectors/ApprovalsView";
import { AuditView, type AuditRow } from "@/components/client-portal/connectors/AuditView";
import { OrgView } from "@/components/client-portal/connectors/OrgView";
import { EntitiesView, type EntityRow } from "@/components/client-portal/connectors/EntitiesView";
import { ScopeEditor } from "@/components/client-portal/connectors/ScopeEditor";
import { SecurityView } from "@/components/client-portal/connectors/SecurityView";
import { DeveloperView } from "@/components/client-portal/connectors/DeveloperView";
import { StatusView } from "@/components/client-portal/connectors/StatusView";
import { UsageView } from "@/components/client-portal/connectors/UsageView";
import { TrustView } from "@/components/client-portal/connectors/TrustView";
import { Card } from "@/components/client-portal/ui";
import { PageHead, SettingsLayout } from "@/components/client-portal/cp";

// Development-only preview of every connector-platform screen with fixture data, for visual review when the live
// database does not yet carry the new tables. In any other NODE_ENV this route is a 404, so it ships to no one.
export const dynamic = "force-dynamic";

const NOW = Date.parse("2026-10-05T15:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();

const conns: ConnRow[] = [
  { id: "c1", connector_key: "netsuite", definition_key: "netsuite", status: "live", health: "healthy", last_success_at: ago(6), last_rows: 18230, stale_after: "26:00:00", managed_by: "client", external_account_id: "TSTDRV1234567" },
  { id: "c2", connector_key: "salesforce", definition_key: "salesforce", status: "live", health: "healthy", last_success_at: ago(3), last_rows: 4120, stale_after: "26:00:00" },
  { id: "c3", connector_key: "stripe", definition_key: "stripe", status: "live", health: "healthy", last_success_at: ago(1), last_rows: 912, stale_after: "26:00:00" },
  { id: "c4", connector_key: "yardi-voyager", definition_key: "yardi-voyager", status: "error", health: "failing", last_success_at: ago(31 * 60), last_rows: 0, stale_after: "26:00:00", error: "The Voyager service account was locked at 2:04 AM. Four of the last 6 syncs read 0 rows. Data already read is unchanged, but figures for Tenant Ledger and Work Orders are now 31 hours behind.", managed_by: "client" },
  { id: "c5", connector_key: "blackbaud-raisers-edge-nxt", definition_key: "blackbaud-raisers-edge-nxt", status: "connected", health: "stale", last_success_at: ago(52 * 60), last_rows: 311, stale_after: "26:00:00" },
  { id: "c6", connector_key: "shopify", definition_key: "shopify", status: "connected", health: "not_running", last_success_at: null, last_rows: null },
  { id: "c7", connector_key: "quickbooks-online", definition_key: "quickbooks-online", status: "requested" },
  { id: "c8", connector_key: "toast", definition_key: "toast", status: "invited" },
  { id: "c9", connector_key: "snowflake", definition_key: "snowflake", status: "key_received" },
  { id: "c10", connector_key: "workday", definition_key: "workday", status: "paused", health: "healthy", last_success_at: ago(5 * 60), last_rows: 880 },
];

const runs = (rowsList: [number, number, SyncRun["status"], string | null][]): SyncRun[] =>
  rowsList.map(([m, rows, status, error], i) => ({ id: `r${i}`, connection_id: "c1", object: ["vendorBill", "invoice", "journalEntry"][i % 3], started_at: ago(m), finished_at: new Date(NOW - m * 60000 + (rows ? 150000 : 400)).toISOString(), status, rows_read: rows, rows_written: rows, error, cursor_before: null, cursor_after: null, attempt: 1 }));

const voyagerRuns = runs([
  [390, 0, "failed", "Authentication refused: the service account is locked."], [450, 0, "failed", "Authentication refused: the service account is locked."], [840, 41902, "partial", "Timed out reading Work orders after 3 min 12 s."],
  [1270, 38114, "succeeded", null], [1700, 52330, "succeeded", null], [2130, 37805, "succeeded", null], [2560, 36990, "succeeded", null],
]).map((r) => ({ ...r, connection_id: "c4" }));

const approvals: Approval[] = [
  { id: "a1", entity_id: null, gate: "money", title: "Pay invoice 88214 from Greenfield Packaging, three-way match passed", detail: "Prepared at 7:41 AM. Purchase order, receipt and invoice agree. Due in 6 days.", proposed: { vendor: "Greenfield Packaging", invoice: "88214", amount: "12,480.00 USD", pay_on: "2026-10-11", matched_to: "PO-30551, receipt R-7782" }, source_ref: "netsuite:vendorbill/88214", status: "pending", decided_by: null, decided_at: null, reason: null, proof: null, created_at: ago(95) },
  { id: "a2", entity_id: null, gate: "money", title: "Refund 38 duplicate card charges", detail: "Detected by comparing Stripe charges with Shopify orders. 38 orders.", proposed: { orders: "38", total: "1,904.50 USD" }, source_ref: "stripe+shopify", status: "pending", decided_by: null, decided_at: null, reason: null, proof: null, created_at: ago(300) },
  { id: "a3", entity_id: null, gate: "send", title: "Email 2,140 members about the autumn open day", detail: "Draft written in your approved voice. Sends Oct 8, 2026, at 9:00 AM.", proposed: { audience: "Active members", recipients: "2,140", send_at: "2026-10-08 09:00" }, source_ref: "mailchimp:campaign/draft-441", status: "pending", decided_by: null, decided_at: null, reason: null, proof: null, created_at: ago(500) },
  { id: "a4", entity_id: null, gate: "send", title: "Late-delivery apology to 6 wholesale accounts", detail: "Each message cites the order and the carrier delay.", proposed: { recipients: "6" }, source_ref: null, status: "pending", decided_by: null, decided_at: null, reason: null, proof: null, created_at: ago(900) },
  { id: "a5", entity_id: null, gate: "legal", title: "Renewal of the lease amendment, clause 14 changed", detail: "Counsel review required before anything is signed.", proposed: { clause: "14", change: "Rent escalator from 3% to 3.5%" }, source_ref: "documents:lease-amend-2026", status: "pending", decided_by: null, decided_at: null, reason: null, proof: null, created_at: ago(2000) },
  { id: "a6", entity_id: null, gate: "money", title: "Pay invoice 88190 from Marrow Dairy", detail: "Approved by A. Castellanos at 8:02 AM.", proposed: null, source_ref: null, status: "approved", decided_by: "u1", decided_at: ago(40), reason: null, proof: "Paid: bank ref 7F2C-0914, matched 9:10 AM", created_at: ago(700) },
  { id: "a7", entity_id: null, gate: "send", title: "Quarterly vendor scorecards to 9 suppliers", detail: "On-time rate and fill rate.", proposed: null, source_ref: null, status: "rejected", decided_by: "u1", decided_at: ago(2500), reason: "Hold until the October close is final.", proof: null, created_at: ago(4000) },
];

const audit: AuditRow[] = [
  ["connection.connected", "A. Castellanos", { connector: "netsuite" }], ["approval.decided", "A. Castellanos", { decision: "approved", title: "Pay invoice 88190" }], ["upload.imported", "L. Ferreira", { file_name: "Gift_Export_Q3.xlsx", rows: 18406 }],
  ["document.downloaded", "T. Brennan", { name: "Board packet Sept.pdf" }], ["entity.created", "A. Castellanos", { name: "Eastgate Store" }], ["api_key.created", "A. Castellanos", { name: "Finance dashboard" }],
  ["security.updated", "A. Castellanos", { reason: "Session length set to 12 hours" }], ["invite.accepted", "M. Reyes", {}], ["connection.paused", "A. Castellanos", { connector: "workday" }], ["document.uploaded", "L. Ferreira", { name: "Lease amendment draft.pdf" }], ["share.created", "T. Brennan", { name: "Q3 results.pdf" }], ["audit.exported", "A. Castellanos", { rows: 4210 }],
].map(([action, who, meta], i) => ({ id: 4210 - i, actor: who as string, action: action as string, target: null, meta: meta as Record<string, unknown>, at: ago(20 + i * 190) }));
const people = ["A. Castellanos", "L. Ferreira", "T. Brennan", "M. Reyes"].map((n) => ({ id: n, email: `${n.toLowerCase().replace(/[^a-z]+/g, ".")}@harborvine.example` }));
const emails = Object.fromEntries(people.map((p) => [p.id, p.email]));

const entities: EntityRow[] = [
  { id: "e0", parent_id: null, kind: "org", name: "Harbor Vine Group", code: "HVG" },
  { id: "e1", parent_id: "e0", kind: "entity", name: "Harbor Vine Retail LLC", code: "HVR" },
  { id: "e2", parent_id: "e1", kind: "location", name: "Harbor Street store", code: "S01" },
  { id: "e3", parent_id: "e1", kind: "location", name: "Millbrook store", code: "S02" },
  { id: "e4", parent_id: "e2", kind: "department", name: "Receiving", code: null },
  { id: "e5", parent_id: "e0", kind: "entity", name: "Harbor Vine Logistics LLC", code: "HVL" },
  { id: "e6", parent_id: "e5", kind: "location", name: "Eastgate warehouse", code: "W01" },
];

function Wrap({ children }: { children: ReactNode }) {
  return <PortalShell tenantName="Harbor Vine Demo" role="owner">{children}</PortalShell>;
}

export default async function DevPreview({ params, searchParams }: { params: Promise<{ page: string }>; searchParams: Promise<{ role?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { page } = await params;
  const sp = await searchParams;
  const viewer = sp.role === "viewer";
  const entries = buildCatalog([]);
  const byKey = (k: string) => entries.find((e) => e.key === k)!;
  const eyebrow = "Harbor Vine Demo";
  const set = (active: string, title: string, lead: string, body: ReactNode) => (
    <Wrap><PageHead eyebrow={`${eyebrow} · Settings`} title={title} lead={lead} /><SettingsLayout active={active} isAdmin>{body}</SettingsLayout></Wrap>
  );

  switch (page) {
    case "catalog":
      return <Wrap><PageHead eyebrow={`${eyebrow} · Connections`} title="Connect the systems" muted="you already run." lead="Each connector shows exactly what it reads before you authorize it. Nothing is written back to your systems without an approval. 3 of 10 connected systems are live and moving data." /><CatalogView entries={entries} conns={conns} now={NOW} canManage /></Wrap>;
    case "detail-failing":
      return <Wrap><DetailView entry={byKey("yardi-voyager")} row={conns[3]} runs={voyagerRuns} now={NOW} canManage /></Wrap>;
    case "detail-oauth":
      return <Wrap><DetailView entry={byKey("hubspot")} runs={[]} now={NOW} canManage /></Wrap>;
    case "detail-partner":
      return <Wrap><DetailView entry={byKey("gusto")} runs={[]} now={NOW} canManage /></Wrap>;
    case "detail-key":
      return <Wrap><DetailView entry={byKey("brevo")} runs={[]} now={NOW} canManage /></Wrap>;
    case "detail-keypair":
      return <Wrap><DetailView entry={byKey("snowflake")} runs={[]} now={NOW} canManage /></Wrap>;
    case "detail-live":
      return <Wrap><DetailView entry={byKey("netsuite")} row={conns[0]} runs={runs([[6, 18230, "succeeded", null], [36, 17902, "succeeded", null], [66, 18011, "succeeded", null]]).map((r) => ({ ...r, connection_id: "c1" }))} now={NOW} canManage /></Wrap>;
    case "upload":
      return <Wrap><PageHead eyebrow={`${eyebrow} · Data`} title="Upload and map" muted="a file." lead="For systems without a connector, or one-off exports. Map the columns, check a preview, then import. Nothing is imported until you confirm." /><UploadView canUpload history={[{ id: "u1", target_object: "payments", row_count: 16902, status: "imported", created_at: ago(60 * 24 * 90) }, { id: "u2", target_object: "people", row_count: 1240, status: "imported", created_at: ago(60 * 24 * 94) }]} /></Wrap>;
    case "health":
      return <Wrap><PageHead eyebrow={`${eyebrow} · Data health`} title="Is your data" muted="current and complete?" lead="Computed from each connection's own sync records, never typed in. A system reads Live only when its health is good and rows moved inside its freshness window." /><HealthView entries={entries} conns={conns} now={NOW} /></Wrap>;
    case "approvals":
      return <Wrap><PageHead eyebrow={`${eyebrow} · Approvals`} title="Approvals" lead="We prepare the work and stop here. Nothing that moves money, sends a message or binds you leaves without a person saying yes. An approval closes only when the result is observed in your systems." /><ApprovalsView approvals={approvals} role={viewer ? "viewer" : "owner"} /></Wrap>;
    case "audit":
      return set("/client/audit", "Audit trail", "Who did what, written by the system as it happens. Page back as far as you need, or export the full range for your own records.", <AuditView rows={audit} filters={{ prefix: "", actor: "", from: "", to: "" }} nextAfter={4199} hasPrev={false} people={people} emails={emails} total={4210} />);
    case "organization":
      return set("/client/organization", "Organization", "Your company, how it is structured, and who works in which part of it.", <OrgView name="Harbor Vine Demo" status="active" role="owner" retentionDays={365} sessionHours={12} entityCount={7} memberCount={4} connectionCount={10} admin />);
    case "entities":
      return set("/client/organization/entities", "Entities and locations", "Model how your organization is actually shaped, from legal entities down to campuses, stores, properties, plants or departments. Access and reporting can follow it.", <EntitiesView entities={entities} canEdit />);
    case "team":
      return <Wrap><PageHead eyebrow={eyebrow} title="Team" lead="Everyone with access to this account." /><Card className="p-6 mb-6"><h2 className="font-serif text-h3 text-text-active mb-1">Access by entity and location</h2><p className="text-small text-text-muted mb-4">Limit a teammate to the parts of the organization they work in.</p><ScopeEditor entities={entities} canEdit members={[{ user_id: "u1", membershipId: "m1", label: "a.castellanos@harborvine.example", role: "owner", entityIds: [] }, { user_id: "u2", membershipId: "m2", label: "l.ferreira@harborvine.example", role: "member", entityIds: ["e2", "e3"] }, { user_id: "u3", membershipId: "m3", label: "t.brennan@harborvine.example", role: "member", entityIds: [] }, { user_id: "u4", membershipId: "m4", label: "m.reyes@harborvine.example", role: "viewer", entityIds: ["e6"] }]} /></Card></Wrap>;
    case "security":
      return set("/client/security", "Security center", "Single sign-on, sign-in rules, retention and who has access to your account.", <SecurityView isOwner security={{ sso_enforced: false, sso_domains: ["harborvine.example"], scim_enabled: false, session_hours: 12, retention_days: 365 }} />);
    case "developer":
      return set("/client/developer", "Developer settings", "Read-only API keys and signed webhooks for your own tools. Secrets are shown once and never again.", <DeveloperView canManage keys={[{ id: "k1", name: "Finance dashboard", prefix: "lv_live_8Qx2", scopes: ["connections:read", "records:read"], created_at: ago(60 * 24 * 12), last_used_at: ago(42), revoked_at: null }, { id: "k2", name: "Old reporting script", prefix: "lv_live_Zp40", scopes: ["approvals:read"], created_at: ago(60 * 24 * 80), last_used_at: null, revoked_at: ago(60 * 24 * 3) }]} webhooks={[{ id: "w1", url: "https://ops.harborvine.example/hooks/loveleeday", events: ["sync.failed", "approval.proposed"], active: true, created_at: ago(60 * 24 * 12) }]} deliveries={[{ id: "d1", endpoint_id: "w1", event: "approval.proposed", status: "delivered", response_code: 200, attempt: 1, at: ago(95) }, { id: "d2", endpoint_id: "w1", event: "sync.failed", status: "failed", response_code: 503, attempt: 3, at: ago(390) }, { id: "d3", endpoint_id: "w1", event: "sync.failed", status: "delivered", response_code: 200, attempt: 4, at: ago(380) }]} />);
    case "status":
      return set("/client/status", "Status and notifications", "What is running, what is behind, and how you want to hear about it.", <StatusView entries={entries} conns={conns} now={NOW} dbOk />);
    case "billing":
      return <Wrap><PageHead eyebrow={eyebrow} title="Billing" lead="Manage your payment method, invoices, and plan through Stripe." /><UsageView u={{ members: 4, connections: 10, rowsRead30d: 2412930, rowsTruncated: false, syncs30d: 1840, uploads30d: 3, documents: 126, apiKeys: 1 }} /></Wrap>;
    case "trust":
      return <TrustView />;
    default:
      notFound();
  }
}
