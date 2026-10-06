// Team lifecycle copy and rules shared by the Team page, its API and tests. The database enforces every rule
// (supabase/loveleeday/20261005_29_membership_lifecycle.sql); these only decide what the screen offers.
import { roleRank } from "./roles.ts";

export const ROLE_HELP: Record<string, string> = {
  owner: "Everything an admin can do, plus billing, security settings and handing the company to someone else. One per company.",
  admin: "Invites and removes people, connects systems, approves actions and sees every record.",
  member: "Works with records, documents and uploads, and approves day-to-day actions.",
  viewer: "Reads records, documents and reports. Changes nothing. Access does not expire on its own, so remove outside accountants, auditors or board members when their work ends.",
};

// Messages the RPCs raise, turned into sentences for the person who clicked. Anything unknown gets a generic line.
const RPC_ERRORS: [RegExp, string][] = [
  [/two-factor/, "Sign in with two-factor authentication to change the team."],
  [/your own role/, "You can't change your own role. Ask another admin or the owner."],
  [/transfer ownership/, "The owner's role changes only by transferring ownership."],
  [/only the owner/, "Only the owner can change or remove another admin."],
  [/accept their invitation/, "They need to accept their invitation before they can own the company."],
  [/already own/, "You already own this company."],
  [/admin, member, or viewer/, "Role must be admin, member, or viewer."],
  [/member not found/, "That person is no longer on this team."],
  [/not allowed/, "You don't have permission to do that."],
];
export function teamErrorMessage(raw: string | undefined): string {
  const m = RPC_ERRORS.find(([re]) => re.test(raw || ""));
  return m ? m[1] : "That change didn't go through. Refresh and try again.";
}

export type TeamRow = { userId: string; membershipId: string; role: string; accepted: boolean };

// What the viewer may do to one row. Mirrors the RPC checks so the screen never offers a button the database refuses.
export function allowedActions(viewer: { userId: string; role: string }, row: TeamRow) {
  const self = viewer.userId === row.userId;
  const viewerOwner = viewer.role === "owner";
  const viewerAdmin = viewerOwner || viewer.role === "admin";
  const rowOwner = row.role === "owner";
  const rowAdmin = row.role === "admin";
  return {
    changeRole: viewerAdmin && !self && !rowOwner && (viewerOwner || !rowAdmin),
    remove: !rowOwner && (self ? roleRank(viewer.role) !== null : viewerAdmin && (viewerOwner || !rowAdmin)),
    makeOwner: viewerOwner && !self && row.accepted,
  };
}

export function inviteEmail(tenantName: string, role: string, link: string) {
  return {
    subject: `You're invited to ${tenantName} on LOVELEEDAY`,
    lines: [
      `You've been invited to join ${tenantName} on LOVELEEDAY as ${role === "admin" ? "an admin" : `a ${role}`}.`,
      ROLE_HELP[role] || "",
      `Open this link to create your account or sign in, and accept: ${link}`,
      "The link works only for this email address and expires in 7 days.",
    ].filter(Boolean),
  };
}
