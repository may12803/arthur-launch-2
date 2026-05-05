import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const PLACEHOLDER = { edges: 6293, principles: 24, skills: 130 };
const MIN_MODULES = 20;

// Public heartbeat — used by Layout's LiveBadge. Returns counts only, no PII.
export async function GET(_req: NextRequest) {
  let modules = MIN_MODULES;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("arthur_inbox_emails")
      .select("domain", { count: "exact", head: false });

    if (!error && data) {
      const distinct = new Set(data.map((r: { domain: string }) => r.domain).filter(Boolean)).size;
      modules = distinct > 0 ? distinct : MIN_MODULES;
    }
  } catch {
    // fall through to placeholder
  }

  return NextResponse.json({
    modules,
    edges: PLACEHOLDER.edges,
    principles: PLACEHOLDER.principles,
    skills: PLACEHOLDER.skills,
  });
}
