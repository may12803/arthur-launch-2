// Chat sessions list + create.
// GET  /api/chat/sessions             — list non-archived sessions (newest first)
// POST /api/chat/sessions             — create new (optional {id, title})

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { authGate } from '@/lib/_auth';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('arthur_chat_sessions')
    .select('id, title, last_message_at, message_count, created_at')
    .eq('archived', false)
    .order('last_message_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;
  let body: { id?: string; title?: string } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const id = (body.id && typeof body.id === 'string') ? body.id : randomUUID();
  const title = (body.title && typeof body.title === 'string') ? body.title.slice(0, 80) : null;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('arthur_chat_sessions')
    .insert({ id, title, last_message_at: new Date().toISOString() })
    .select('id, title, last_message_at, message_count, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}
