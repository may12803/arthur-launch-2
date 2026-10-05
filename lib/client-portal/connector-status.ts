import { oauthEndpoints, type CatalogEntry } from "./connector-ui";

// A connector is available when a client can complete the connection today: not partner-gated, and, when it
// connects by sign-in, its vendor app credentials are present in this server's environment.
export function connectorAvailable(e: Pick<CatalogEntry, "key" | "methods" | "gate">, env: Record<string, string | undefined> = process.env): boolean {
  if (e.gate.kind === "partner") return false;
  if (e.methods.includes("Sign in") && !oauthEndpoints(e.key, env)) return false;
  return true;
}
