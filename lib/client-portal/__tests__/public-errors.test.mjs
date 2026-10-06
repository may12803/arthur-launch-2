import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OAUTH_ERRORS, oauthErrorText, publicDbError } from "../public-errors.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

test("oauth: the callback puts only a stable code in the redirect URL, never vendor or database text (finding 12)", () => {
  const cb = read("app/api/client/connectors/oauth/callback/route.ts");
  assert.doesNotMatch(cb, /searchParams\.set\("error", error\.slice/);
  assert.doesNotMatch(cb, /The vendor declined: \$\{/);
  assert.doesNotMatch(cb, /back\([^)]*e instanceof Error \? e\.message/);
  assert.match(cb, /back\(st\.connector_key, "exchange_failed"\)/);
  // Every code the route can emit is one the page can render.
  for (const code of cb.matchAll(/back\((?:null|st\.connector_key), "([a-z_]+)"\)/g)) assert.ok(code[1] in OAUTH_ERRORS, `unknown code ${code[1]}`);
});

test("oauth: an unknown or hostile error param renders the generic sentence, not itself", () => {
  const out = oauthErrorText("<script>alert(1)</script> invalid_client: secret abc");
  assert.doesNotMatch(out, /script|secret|invalid_client/);
  assert.equal(oauthErrorText(null), null);
  assert.equal(oauthErrorText("vendor_declined"), OAUTH_ERRORS.vendor_declined);
  assert.doesNotMatch(read("app/client/(portal)/connections/[key]/page.tsx"), /Sign-in did not complete: \$\{sp\.error\}/);
});

test("db errors: a raw message with internals maps to a stable code and fixed text (finding 13)", () => {
  const raw = 'function public.connection_x(uuid) does not exist; relation "tenant_connections" secret_col=abc';
  const e = publicDbError(raw);
  assert.deepEqual([e.status, e.code], [501, "not_available"]);
  assert.doesNotMatch(e.message, /connection_x|tenant_connections|secret_col/);
  assert.deepEqual(publicDbError("permission denied for table x").code, "forbidden");
  assert.deepEqual(publicDbError("Not signed in").status, 401);
  assert.deepEqual(publicDbError("syntax error near 'DROP'").code, "server_error");
});

test("dbFail never interpolates the raw message into the response", () => {
  const src = read("lib/client-portal/connector-api.ts");
  const fn = src.slice(src.indexOf("export function dbFail"), src.indexOf("export function clip"));
  assert.match(fn, /console\.error/);
  assert.doesNotMatch(fn, /NextResponse\.json\([^)]*\$\{message\}/);
  assert.doesNotMatch(fn, /\(\$\{message\}\)/);
  assert.match(fn, /publicDbError\(message\)/);
});

test("the connections pages no longer render database messages", () => {
  assert.doesNotMatch(read("app/client/(portal)/connections/page.tsx"), /\.error\.message\}/);
  assert.doesNotMatch(read("app/client/(portal)/connections/[key]/page.tsx"), /\.error\.message\}`\b/);
});
