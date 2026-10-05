// Server-side recorder for callers that know the tenant: hands recordLlmUsage the real database and server secret.
// Pass the result as `usage.record` in the snapshot service Deps (see lib/snapshot/service.ts).
import { loveleedayAnon } from "../client-portal/anon.ts";
import { connectorsServerSecret } from "../client-portal/connector-api.ts";
import { recordLlmUsage, type LlmUsage, type UsageDb } from "./cost.ts";

export function tenantUsageRecorder() {
  return async (tenantId: string, usage: LlmUsage) => {
    const secret = connectorsServerSecret();
    if (!secret) return { ok: false, error: "not configured", costMicros: 0 };
    return recordLlmUsage(loveleedayAnon() as unknown as UsageDb, secret, tenantId, usage);
  };
}
