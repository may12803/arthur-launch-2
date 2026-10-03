// The portal's single role ordering. The database mirrors it as public.role_rank() (supabase/loveleeday/20261004_codex_round4_*.sql);
// roles.test.mjs fails if the two lists drift. Anything that compares roles uses roleRank(): an unknown role has no rank and never wins.
export const ROLE_ORDER = ["viewer", "member", "admin", "owner"] as const;
export type Role = (typeof ROLE_ORDER)[number];

export function roleRank(role: string | null | undefined): number | null {
  const i = ROLE_ORDER.indexOf(role as Role);
  return i < 0 ? null : i + 1;
}

// Roles a team invite may carry (owners come only from staff provisioning).
export const INVITABLE_ROLES: ReadonlySet<string> = new Set(ROLE_ORDER.filter((r) => r !== "owner"));
