// Chat sessions detail + delete.
// GET    /api/chat/sessions/[id]            — load messages for a session
// DELETE /api/chat/sessions/[id]            — archive (soft-delete) the session
// PATCH  /api/chat/sessions/[id]            — rename: {title}

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { authGate } from '@/lib/_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const deny = authGate(req);
  if (deny) return deny;
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('arthur_dashboard_conversations')
    .select('id, role, content, tool_calls, tool_results, metadata, created_at')
    .eq('session_id', id)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const deny = authGate(req);
  if (deny) return deny;
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { error } = await db
    .from('arthur_chat_sessions')
    .update({ archived: true })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const deny = authGate(req);
  if (deny) return deny;
  const { id } = await params;
  let body: { title?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  if (!body.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  const db = getSupabaseAdmin();
  const { error } = await db
    .from('arthur_chat_sessions')
    .update({ title: body.title.slice(0, 80) })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
