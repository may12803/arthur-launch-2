// /api/inbox/summary — unread count + top 3. Direct Supabase query (Fly
// networking blocks in-instance HTTP loopback, so we can't subrequest
// /api/inbox/list).
import { NextRequest, NextResponse } from 'next/server';
import { authGate } from '@/lib/_auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  try {
    const db = getSupabaseAdmin();

    // Schema (verified from /api/inbox/list/route.ts): inbox = direction=inbound,
    // is_archived=false, is_deleted=false. Unread = is_read=false.
    // Date column is `received_at` (not `date`).
    const baseFilter = (q: any) =>
      q.eq('direction', 'inbound').eq('is_archived', false).eq('is_deleted', false);

    const { count, error: ce } = await baseFilter(
      db.from('arthur_inbox_emails').select('id', { count: 'exact', head: true })
    ).eq('is_read', false);
    if (ce) throw ce;

    const { data, error: de } = await baseFilter(
      db.from('arthur_inbox_emails').select('id, from_email, from_name, subject, received_at, domain')
    )
      .eq('is_read', false)
      .order('received_at', { ascending: false })
      .limit(3);
    if (de) throw de;

    return NextResponse.json({
      unread_count: count || 0,
      top: (data || []).map((r: any) => ({
        id: r.id,
        from: r.from_name ? `${r.from_name} <${r.from_email}>` : r.from_email,
        subject: r.subject || '(no subject)',
        date: r.received_at,
        account: r.domain,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({
      unread_count: 0,
      top: [],
      error: e.message?.slice(0, 200) || 'query_failed',
    }, { status: 200 });
  }
}
