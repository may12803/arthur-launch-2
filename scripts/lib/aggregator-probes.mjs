// Aggregator vendors (Nango, Merge, Unified, Pipedream, Plaid, Finch) probed through a LIST/TOKEN endpoint that needs the key.
// CLIENT_VERIFIED only when the real credential is accepted AND a wrong-credential control is refused. Identical answers
// prove nothing and stay CONFIGURED (Finch answers a bogus code the same for any secret, so it stays CONFIGURED).
const J = { "content-type": "application/json" };
const R = "https://portal.loveleedaystudios.com/api/client/connectors/oauth/callback";
const bad = "wrong-credential-" + "x".repeat(24);
const arr = (j) => (Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.results) ? j.results : Array.isArray(j?.institutions) ? j.institutions : []).length;

export const AGGREGATOR_PROBES = {
  nango: { need: ["NANGO_SECRET_KEY"], object: "integrations", call: (e, b) => ["https://api.nango.dev/integrations", { headers: { authorization: `Bearer ${b ? bad : e.NANGO_SECRET_KEY}` } }], count: arr },
  merge: { need: ["MERGE_TEST_API_KEY"], object: "organization integrations", call: (e, b) => ["https://api.merge.dev/api/organizations/integrations", { headers: { authorization: `Bearer ${b ? bad : e.MERGE_TEST_API_KEY}` } }], count: arr },
  unified: { need: ["UNIFIED_API_KEY"], object: "integrations", call: (e, b) => ["https://api.unified.to/unified/integration", { headers: { authorization: `Bearer ${b ? bad : e.UNIFIED_API_KEY}` } }], count: arr },
  pipedream: { need: ["PIPEDREAM_CLIENT_ID", "PIPEDREAM_CLIENT_SECRET"], object: "oauth token", call: (e, b) => ["https://api.pipedream.com/v1/oauth/token", { method: "POST", headers: J, body: JSON.stringify({ grant_type: "client_credentials", client_id: e.PIPEDREAM_CLIENT_ID, client_secret: b ? bad : e.PIPEDREAM_CLIENT_SECRET }) }], count: (j) => (typeof j?.access_token === "string" ? 1 : 0) },
  plaid: { need: ["PLAID_CLIENT_ID", "PLAID_SANDBOX_SECRET"], object: "institutions", call: (e, b) => ["https://sandbox.plaid.com/institutions/get", { method: "POST", headers: J, body: JSON.stringify({ client_id: e.PLAID_CLIENT_ID, secret: b ? bad : e.PLAID_SANDBOX_SECRET, count: 5, offset: 0, country_codes: ["US"] }) }], count: arr },
  // Finch has no authenticated list endpoint; a bogus code is refused at the grant level for any secret, so this cannot verify.
  finch: { need: ["FINCH_CLIENT_ID", "FINCH_CLIENT_SECRET"], object: "token grant", grantOnly: true, call: (e, b) => ["https://api.tryfinch.com/auth/token", { method: "POST", headers: J, body: JSON.stringify({ client_id: e.FINCH_CLIENT_ID, client_secret: b ? bad : e.FINCH_CLIENT_SECRET, code: "bogus-code", redirect_uri: R }) }], count: () => 0 },
};

/** Pure classifier so it can be unit-tested: real/ctrl = {http, n, msg}. */
export function classifyAggregator(p, real, ctrl) {
  if (p.grantOnly) {
    const sameAnswer = real.http === ctrl.http && real.msg === ctrl.msg;
    return sameAnswer ? "CONFIGURED" : real.http === 400 ? "CLIENT_VERIFIED" : real.http === 401 || real.http === 403 ? "CLIENT_REJECTED" : "CONFIGURED";
  }
  if (real.http === 200 && ctrl.http !== 200) return "CLIENT_VERIFIED";
  if (real.http === 401 || real.http === 403 || real.http === 400) return "CLIENT_REJECTED";
  return "CONFIGURED";
}

export async function aggregatorProbe(key, env, fetchImpl = globalThis.fetch) {
  const p = AGGREGATOR_PROBES[key];
  const out = { key, at: new Date().toISOString(), status: "NOT_CONFIGURED", names: Object.keys(env).sort(), steps: [] };
  const missing = p.need.filter((n) => !env[n]);
  if (missing.length) { out.steps.push(`missing names: ${missing.join(", ")}`); return out; }
  out.status = "CONFIGURED";
  const go = async (b) => {
    const [u, init] = p.call(env, b);
    const r = await fetchImpl(u, { ...init, redirect: "manual" });
    const j = await r.json().catch(() => ({}));
    return { http: r.status, n: r.ok ? p.count(j) : 0, msg: typeof j?.finch_code === "string" ? j.finch_code : "" };
  };
  try {
    const real = await go(false), ctrl = await go(true);
    out.steps.push(`${p.object}: HTTP ${real.http} ${real.n} record(s)`, `wrong-credential control: HTTP ${ctrl.http}`);
    out.status = classifyAggregator(p, real, ctrl);
    if (out.status === "CLIENT_VERIFIED" && real.n) out.evidence = { object: p.object, record_count: real.n, via: "vendor list/token endpoint (no adapter)" };
    if (p.grantOnly && out.status === "CONFIGURED") out.steps.push("control answered the same as the real secret: client validity unproven");
  } catch (err) { out.steps.push(`unreachable: ${err?.cause?.code || err?.name || "error"}`); }
  return out;
}
