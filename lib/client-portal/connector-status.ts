import { oauthEndpoints, type CatalogEntry } from "./connector-ui";
import { CONNECTOR_DEFINITIONS } from "../connectors/definitions.generated";

const BUILD_STATUS = new Map(CONNECTOR_DEFINITIONS.map((d) => [d.key, d.build_status]));

// A connector is available when a client can complete the connection today AND we can pull its data: not
// partner-gated, its adapter is built (or it rides the CSV/SFTP upload path), and, when it connects by sign-in,
// its vendor app credentials are present in this server's environment. A "planned" adapter is coming soon even
// if a customer could hand us credentials — the public directory must not promise a connection we cannot sync
// (Codex site review 2026-10-05 flagged Microsoft 365 et al. as available with no adapter).
export function connectorAvailable(e: Pick<CatalogEntry, "key" | "methods" | "gate">, env: Record<string, string | undefined> = process.env): boolean {
  if (e.gate.kind === "partner") return false;
  if (BUILD_STATUS.get(e.key) === "planned") return false;
  if (e.methods.includes("Sign in") && !oauthEndpoints(e.key, env)) return false;
  return true;
}
