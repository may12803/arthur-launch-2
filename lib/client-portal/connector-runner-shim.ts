// Stand-in for lib/connectors/runner (theme B) so app/api/cron/sync compiles before the branches merge. At merge,
// replace the body with runConnection(conn, adapter, supabaseRpcStore) per due connection. Until then it reports,
// honestly, that nothing was run, so the cron response can never be mistaken for a sync that moved data.
export type DueConnection = { connection_id: string; tenant_id: string; connector_key: string; definition_key?: string | null };
export type RunSummary = { due: number; ran: number; failed: number; runner: "unmerged" | "live"; note?: string };

export async function runDueConnections(due: DueConnection[]): Promise<RunSummary> {
  return { due: due.length, ran: 0, failed: 0, runner: "unmerged", note: "The sync runner (lib/connectors/runner) is not merged into this branch; no connection was read." };
}
