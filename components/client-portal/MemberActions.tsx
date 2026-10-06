"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass } from "./ui";

type Props = {
  membershipId: string;
  label: string;
  role: string;
  self: boolean;
  can: { changeRole: boolean; remove: boolean; makeOwner: boolean };
};

// Per-row team controls. The buttons shown come from allowedActions(); the database decides again on every click.
export function MemberActions({ membershipId, label, role, self, can }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action: string, extra: Record<string, string> = {}, confirmText?: string) {
    if (busy || (confirmText && !window.confirm(confirmText))) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/client/team/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, membershipId, ...extra }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || "That change didn't go through.");
    if (action === "remove" && self) return (window.location.href = "/client/select-company");
    router.refresh();
  }

  if (!can.changeRole && !can.remove && !can.makeOwner) return null;
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex flex-wrap items-center justify-end gap-3">
        {can.changeRole && (
          <select
            aria-label={`Role for ${label}`}
            value={role}
            disabled={busy}
            onChange={(e) => act("set_role", { role: e.target.value }, `Change ${label} to ${e.target.value}?`)}
            className={`${inputClass} !w-auto !py-1 text-[12.5px]`}
          >
            <option value="viewer">Viewer</option>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        )}
        {can.makeOwner && (
          <button type="button" disabled={busy} className="ll-text-link text-[12.5px]"
            onClick={() => act("transfer_ownership", {}, `Make ${label} the owner? You will become an admin, and only they can undo this.`)}>
            Make owner
          </button>
        )}
        {can.remove && (
          <button type="button" disabled={busy} className="ll-text-link text-[12.5px]"
            onClick={() => act("remove", {}, self ? "Leave this company? You will lose access until someone invites you again." : `Remove ${label}? They lose access immediately.`)}>
            {self ? "Leave" : "Remove"}
          </button>
        )}
      </span>
      {error && <span role="alert" className="text-[12px] text-red-700">{error}</span>}
    </span>
  );
}
