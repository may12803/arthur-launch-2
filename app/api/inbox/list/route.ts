import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

// TODO: add session-based auth gate (same-origin browser calls for now)

type Folder = "inbox" | "sent" | "archived" | "deleted" | "drafts" | "flagged";

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const domain      = searchParams.get("domain") ?? "";
  const q           = searchParams.get("q") ?? "";
  // `folder` takes precedence; fall back to legacy `archived` param for backward compat
  const folderParam = searchParams.get("folder");
  const legacyArchived = searchParams.get("archived") === "true";
  const folder: Folder =
    folderParam === "sent" || folderParam === "archived" || folderParam === "deleted" ||
    folderParam === "drafts" || folderParam === "flagged"
      ? folderParam
      : "inbox";
  const unreadOnly  = searchParams.get("unread_only") === "true";
  const repliedOnly = searchParams.get("replied_only") === "true";
  // Smart filters (action-oriented; preferred over raw unread/replied)
  const smart = searchParams.get("smart") ?? "";  // "needs_attention" | "awaiting_reply" | "this_week" | ""
  const limit       = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset      = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

  const db = getSupabaseAdmin();

  // ── counts for all folders (parallel, cheap head requests) ──────────────
  const [cInbox, cSent, cArchived, cDeleted, cDrafts, cFlagged] = await Promise.all([
    db.from("arthur_inbox_emails").select("id", { count: "exact", head: true })
      .eq("direction", "inbound").eq("is_archived", false).eq("is_deleted", false),
    db.from("arthur_inbox_emails").select("id", { count: "exact", head: true })
      .eq("direction", "outbound").eq("is_deleted", false),
    db.from("arthur_inbox_emails").select("id", { count: "exact", head: true })
      .eq("direction", "inbound").eq("is_archived", true).eq("is_deleted", false),
    db.from("arthur_inbox_emails").select("id", { count: "exact", head: true })
      .eq("is_deleted", true),
    // Drafts: auto_action='draft' AND requires_review=true AND not deleted
    db.from("arthur_inbox_emails").select("id", { count: "exact", head: true })
      .eq("auto_action", "draft").eq("requires_review", true).eq("is_deleted", false),
    // Flagged: requires_review=true AND (auto_action IS NULL OR auto_action != 'draft') AND not deleted
    // (Postgres three-valued logic: .neq() excludes NULL, so we need explicit OR for the null case)
    db.from("arthur_inbox_emails").select("id", { count: "exact", head: true })
      .eq("requires_review", true).or("auto_action.is.null,auto_action.neq.draft").eq("is_deleted", false),
  ]);

  const counts: Record<Folder, number> = {
    inbox:    cInbox.count    ?? 0,
    sent:     cSent.count     ?? 0,
    archived: cArchived.count ?? 0,
    deleted:  cDeleted.count  ?? 0,
    drafts:   cDrafts.count   ?? 0,
    flagged:  cFlagged.count  ?? 0,
  };

  // ── base count query for current folder ───────────────────────────────────
  let countQuery = db
    .from("arthur_inbox_emails")
    .select("id", { count: "exact", head: true });

  if (folder === "sent") {
    countQuery = countQuery.eq("direction", "outbound").eq("is_deleted", false);
  } else if (folder === "archived") {
    countQuery = countQuery.eq("direction", "inbound").eq("is_archived", true).eq("is_deleted", false);
  } else if (folder === "deleted") {
    countQuery = countQuery.eq("is_deleted", true);
  } else if (folder === "drafts") {
    countQuery = countQuery.eq("auto_action", "draft").eq("requires_review", true).eq("is_deleted", false);
  } else if (folder === "flagged") {
    countQuery = countQuery.eq("requires_review", true).or("auto_action.is.null,auto_action.neq.draft").eq("is_deleted", false);
  } else {
    // inbox (default)
    countQuery = countQuery.eq("direction", "inbound").eq("is_archived", legacyArchived).eq("is_deleted", false);
  }

  if (domain) countQuery = countQuery.eq("domain", domain);
  if (unreadOnly) countQuery = countQuery.eq("is_read", false);
  if (repliedOnly) countQuery = countQuery.not("replied_at", "is", null);

  // Smart filters — apply to count too so `total` matches the row set
  if (smart === "needs_attention") {
    countQuery = countQuery.or("is_read.eq.false,requires_review.eq.true,auto_action.eq.flag");
  } else if (smart === "awaiting_reply") {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    countQuery = countQuery.eq("direction", "outbound").lt("received_at", fiveDaysAgo);
  } else if (smart === "this_week") {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    countQuery = countQuery.gte("received_at", sevenDaysAgo);
  }

  if (q) {
    countQuery = countQuery.or(
      `subject.ilike.%${q}%,from_email.ilike.%${q}%,from_name.ilike.%${q}%,body_text.ilike.%${q}%`
    );
  }

  const { count, error: countError } = await countQuery;
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  // ── rows ──────────────────────────────────────────────────────────────────
  let rowsQuery = db
    .from("arthur_inbox_emails")
    .select(
      "id,from_email,from_name,to_email,subject,body_text,received_at,domain,mailbox,is_read,is_archived,label,replied_at,annotation,direction,is_deleted,in_reply_to,classification,auto_action,auto_action_at,requires_review,draft_subject,draft_body,draft_to,actor"
    )
    .order("received_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (folder === "sent") {
    rowsQuery = rowsQuery.eq("direction", "outbound").eq("is_deleted", false);
  } else if (folder === "archived") {
    rowsQuery = rowsQuery.eq("direction", "inbound").eq("is_archived", true).eq("is_deleted", false);
  } else if (folder === "deleted") {
    rowsQuery = rowsQuery.eq("is_deleted", true);
  } else if (folder === "drafts") {
    rowsQuery = rowsQuery.eq("auto_action", "draft").eq("requires_review", true).eq("is_deleted", false);
  } else if (folder === "flagged") {
    rowsQuery = rowsQuery.eq("requires_review", true).or("auto_action.is.null,auto_action.neq.draft").eq("is_deleted", false);
  } else {
    rowsQuery = rowsQuery.eq("direction", "inbound").eq("is_archived", legacyArchived).eq("is_deleted", false);
  }

  if (domain) rowsQuery = rowsQuery.eq("domain", domain);
  if (unreadOnly) rowsQuery = rowsQuery.eq("is_read", false);
  if (repliedOnly) rowsQuery = rowsQuery.not("replied_at", "is", null);

  // Smart filters
  if (smart === "needs_attention") {
    // Inbound + (unread OR requires_review OR auto_action='flag')
    rowsQuery = rowsQuery.or("is_read.eq.false,requires_review.eq.true,auto_action.eq.flag");
  } else if (smart === "awaiting_reply") {
    // Sent rows where I replied >5 days ago (looking for follow-up candidates)
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    rowsQuery = rowsQuery.eq("direction", "outbound").lt("received_at", fiveDaysAgo);
  } else if (smart === "this_week") {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    rowsQuery = rowsQuery.gte("received_at", sevenDaysAgo);
  }

  if (q) {
    rowsQuery = rowsQuery.or(
      `subject.ilike.%${q}%,from_email.ilike.%${q}%,from_name.ilike.%${q}%,body_text.ilike.%${q}%`
    );
  }

  const { data, error } = await rowsQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [], total: count ?? 0, counts });
}
