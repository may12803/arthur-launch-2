import { Panel, PanelHead, Stat } from "../cp";

export type Usage = {
  members: number | null;
  connections: number | null;
  rowsRead30d: number | null;
  rowsTruncated: boolean;
  syncs30d: number | null;
  uploads30d: number | null;
  documents: number | null;
  apiKeys: number | null;
};

const n = (v: number | null) => (v == null ? "-" : v.toLocaleString("en-US"));

// Usage counted from the account's own records. Plan and invoices are in the billing portal above; nothing here is an
// estimate, and a figure that could not be read shows a dash instead of zero.
export function UsageView({ u, errors }: { u: Usage; errors?: (string | null)[] }) {
  return (
    <Panel className="mt-6">
      <PanelHead title="Usage" sub="Counted from your account's records, last 30 days unless noted." />
      <div className="cp-panel-b grid gap-5">
        {errors?.some(Boolean) ? <div className="cp-banner bad" role="alert"><div><b>Some usage figures did not load.</b>{errors.filter(Boolean).map((e, i) => <div key={i} className="mt-0.5 break-words">{e}</div>)}</div></div> : null}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Rows read" value={n(u.rowsRead30d)} sub={u.syncs30d != null ? `${n(u.syncs30d)} syncs${u.rowsTruncated ? ", latest 5,000 runs" : ""}` : undefined} />
          <Stat label="Connected systems" value={n(u.connections)} />
          <Stat label="Members" value={n(u.members)} />
          <Stat label="Files imported" value={n(u.uploads30d)} />
          <Stat label="Documents stored" value={n(u.documents)} sub="All time" />
          <Stat label="Active API keys" value={n(u.apiKeys)} />
        </div>
      </div>
    </Panel>
  );
}
