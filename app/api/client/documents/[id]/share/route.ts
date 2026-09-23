import { NextRequest, NextResponse } from "next/server";
import { getApiContext, publicOrigin, rpcErrorResponse } from "@/lib/client-portal/api";
import { sendPortalMail } from "@/lib/client-portal/mailer";

export const runtime = "nodejs";

// Share one document with a named person outside the company. The database
// (share_create) enforces the sharing switch, the role and the day limit, and
// returns the link token once; only its hash is stored. The link goes to the
// recipient by email: they then verify with a one-time code before anything opens.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const days = Number(body.days || 7);

  const { data: token, error } = await ctx.supabase.rpc("share_create", { p_document: id, p_email: email, p_days: days });
  if (error) {
    const m = error.message;
    if (/turned off|valid email|days for this account|not allowed/i.test(m)) return NextResponse.json({ error: m.charAt(0).toUpperCase() + m.slice(1) + "." }, { status: 400 });
    return rpcErrorResponse(m);
  }

  const [{ data: doc }, { data: tenant }] = await Promise.all([
    ctx.supabase.from("documents").select("name").eq("id", id).maybeSingle<{ name: string }>(),
    ctx.supabase.from("tenants").select("name").eq("id", ctx.tenantId).maybeSingle<{ name: string }>(),
  ]);
  const link = `${publicOrigin(req)}/share/${token}`;
  const sent = await sendPortalMail(email, `${tenant?.name || "A LOVELEEDAY client"} shared a document with you`, [
    `${tenant?.name || "A LOVELEEDAY client"} shared "${doc?.name || "a document"}" with you through LOVELEEDAY.`,
    `Open it here: ${link}`,
    `You'll be asked for a one-time code sent to this address before the file opens. The link works for ${days} day${days === 1 ? "" : "s"} and only for you.`,
  ]);
  return NextResponse.json({ ok: true, emailed: sent });
}
