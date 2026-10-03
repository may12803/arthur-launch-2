import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE_ORDER, roleRank, INVITABLE_ROLES } from "../roles.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(here, "../../../supabase/loveleeday/20261004_codex_round4_roles_and_provisioning.sql"), "utf8");

test("P16: the TypeScript role order is exactly the database's role_rank()", () => {
  const body = sql.match(/function public\.role_rank[\s\S]*?\$\$;/)[0];
  const pairs = [...body.matchAll(/when '(\w+)' then (\d)/g)].map((m) => [m[1], Number(m[2])]);
  assert.deepEqual(pairs, ROLE_ORDER.map((r, i) => [r, i + 1]));
});

test("P16: admin outranks member, owner outranks admin, unknown roles have no rank", () => {
  assert.ok(roleRank("admin") > roleRank("member")); assert.ok(roleRank("owner") > roleRank("admin"));
  assert.equal(roleRank("superuser"), null); assert.equal(roleRank(undefined), null);
});

test("invites may carry admin, member or viewer, never owner", () => {
  assert.deepEqual([...INVITABLE_ROLES].sort(), ["admin", "member", "viewer"]);
});

test("accept_invite uses role_rank for both sides of the comparison and refuses unknown roles", () => {
  const fn = sql.match(/function public\.accept_invite[\s\S]*$/)[0];
  assert.match(fn, /role_rank\(excluded\.role\) > public\.role_rank\(public\.memberships\.role\)/);
  assert.match(fn, /unknown role/);
  assert.ok(!/array_position/.test(fn), "no inline role array");
});
