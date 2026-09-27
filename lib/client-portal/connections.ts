// Connections: the platforms a client's business runs on, connected by one-click sign-in (oauth), by adding
// LOVELEEDAY as a user (invite), or by handing over a read-only key (key). Keys are write-only: encrypted with the
// client's Vault key by connection_set_key() and readable only by LOVELEEDAY's server prober.

export type Connector = {
  key: string; name: string; category: string; method: "oauth" | "invite" | "key";
  uses: string; never: string; read_scope: string; write_scope: string | null;
  invite_steps: string | null; key_fields: { name: string; label: string; hint?: string }[] | null; key_help: string | null;
  sort: number; oneclick_ready: boolean;
};
export type ConnStatus = "not_connected" | "requested" | "invited" | "key_received" | "connected" | "live" | "error" | "paused" | "disconnected";
export type TenantConnection = {
  connector_key: string; status: ConnStatus; access: "read" | "read_write"; managed_by: "client" | "loveleeday";
  note: string | null; proof: string | null; error: string | null; last_probe_at: string | null; updated_at: string;
};

// Written for the client: each step up the ladder is a different claim, and only "Live" means data really flowed.
export const CONN_LABEL: Record<ConnStatus, [string, string]> = {
  not_connected: ["Not connected", "bg-[#eef0f3] text-[#4a4f58]"],
  requested: ["Requested", "bg-[#edf3fc] text-[#2d6aa8]"],
  invited: ["Invite sent · we'll confirm", "bg-[#edf3fc] text-[#2d6aa8]"],
  key_received: ["Key received · verifying", "bg-[#fff4e0] text-[#8a5a00]"],
  connected: ["Connected · limited", "bg-[#fff4e0] text-[#8a5a00]"],
  live: ["Live · verified", "bg-[#e6f4ea] text-[#1e6b3a]"],
  error: ["Needs attention", "bg-[#fdecea] text-[#a1291f]"],
  paused: ["Paused", "bg-[#eef0f3] text-[#4a4f58]"],
  disconnected: ["Disconnected", "bg-[#eef0f3] text-[#4a4f58]"],
};
export const METHOD_LABEL = { oauth: "One-click sign-in", invite: "Add LOVELEEDAY as a user", key: "Read-only key" } as const;
