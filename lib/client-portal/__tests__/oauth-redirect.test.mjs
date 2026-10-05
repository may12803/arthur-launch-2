import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { oauthRedirectUri, OAUTH_CALLBACK_PATH } from "../oauth-redirect.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("redirect URI is the one registered value: portal host in production, localhost:3000 in development", () => {
  assert.equal(oauthRedirectUri("production"), "https://portal.loveleedaystudios.com/api/client/connectors/oauth/callback");
  assert.equal(oauthRedirectUri("development"), "http://localhost:3000/api/client/connectors/oauth/callback");
  assert.equal(oauthRedirectUri(undefined), "https://portal.loveleedaystudios.com/api/client/connectors/oauth/callback");
});

test("the callback route exists at the registered path and the start route never derives the URI from the request host", () => {
  assert.ok(existsSync(path.join(root, "app", OAUTH_CALLBACK_PATH, "route.ts")), "callback route file at the registered path");
  assert.ok(!existsSync(path.join(root, "app/api/connectors/oauth/callback/route.ts")), "old callback path removed");
  const start = readFileSync(path.join(root, "app/api/client/connectors/[key]/oauth/start/route.ts"), "utf8");
  assert.match(start, /oauthRedirectUri\(\)/);
  assert.doesNotMatch(start, /publicOrigin\(req\)[^\n]*callback/);
});

test("the callback never echoes database error text to the browser", () => {
  const cb = readFileSync(path.join(root, "app", OAUTH_CALLBACK_PATH, "route.ts"), "utf8");
  assert.doesNotMatch(cb, /\$\{stored\.error\.message\}/);
});
