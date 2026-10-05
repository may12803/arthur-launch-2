import { NextRequest, NextResponse } from 'next/server';
import { getOutreachStore } from '@/lib/outreach/store';
import { isOneClickBody, unsubscribeByToken } from '@/lib/outreach/lifecycle';
import { unsubscribePage } from '@/lib/outreach/unsubscribe-page';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };

// GET: the link in the message footer. Unsubscribes immediately (a mail scanner prefetching the link suppresses
// the address, which fails safe) and shows a confirmation page.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const r = await unsubscribeByToken(getOutreachStore(), token);
    return new NextResponse(unsubscribePage(r.ok, r.email), { status: r.ok ? 200 : 404, headers: HTML });
  } catch {
    return new NextResponse(unsubscribePage(false), { status: 503, headers: HTML });
  }
}

// POST: RFC 8058 one-click. The mail client posts the form pair List-Unsubscribe=One-Click; no cookies or login.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.text()).slice(0, 1000);
  if (!isOneClickBody(body)) return new NextResponse('Expected List-Unsubscribe=One-Click', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  try {
    const r = await unsubscribeByToken(getOutreachStore(), token);
    return new NextResponse(r.ok ? 'Unsubscribed' : 'Unknown link', { status: r.ok ? 200 : 404, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return new NextResponse('Temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
