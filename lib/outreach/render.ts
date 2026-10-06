// Renders exactly what would go out: text + HTML (<p> paragraphs, never hard-wrapped lines), the physical-address
// footer, the unsubscribe link, and the RFC 8058 headers. Refuses to render when the postal address or the token
// secret is unset, so a "sendable" message can never exist without them (dry-run included: preview == reality).
import { createHash, createHmac } from 'node:crypto';
import type { OutreachConfig } from './config.ts';
import type { Message } from './store.ts';

export class RenderError extends Error {
  code: 'no_postal_address' | 'no_token_secret' | 'empty_body';
  constructor(code: RenderError['code'], message: string) { super(message); this.code = code; }
}

// Deterministic per-contact token (HMAC), so a dry run shows the real link. Only its sha256 is stored.
export const unsubscribeToken = (secret: string, contactId: string) => createHmac('sha256', secret).update(`unsub:${contactId}`).digest('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Paragraphs are separated by blank lines; single newlines inside a paragraph are re-flowed (hard wraps removed).
export const paragraphs = (body: string) => body.replace(/\r\n/g, '\n').split(/\n{2,}/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);

export interface Rendered {
  from: string; replyTo: string; to: string; subject: string; text: string; html: string; headers: Record<string, string>; unsubscribeUrl: string;
}

export function renderMessage(msg: Pick<Message, 'to_email' | 'subject' | 'body' | 'contact_id'>, cfg: OutreachConfig): Rendered {
  if (!cfg.postalAddress) throw new RenderError('no_postal_address', 'OUTREACH_POSTAL_ADDRESS is not set; refusing to render a sendable message.');
  if (!cfg.tokenSecret) throw new RenderError('no_token_secret', 'OUTREACH_TOKEN_SECRET is not set; cannot mint an unsubscribe link.');
  const paras = paragraphs(msg.body);
  if (!paras.length) throw new RenderError('empty_body', 'Message body is empty.');
  const token = unsubscribeToken(cfg.tokenSecret, msg.contact_id);
  const unsubscribeUrl = `${cfg.baseUrl}/api/public/unsubscribe/${token}`;
  const address = cfg.postalAddress.replace(/\s*\n\s*/g, ', ');
  const lu = [`<${unsubscribeUrl}>`, ...(cfg.unsubscribeMailto ? [`<mailto:${cfg.unsubscribeMailto}?subject=unsubscribe>`] : [])].join(', ');
  const text = [...paras, '--', `LOVELEEDAY Studios LLC · loveleedaystudios.com · ${address}`, `If you would rather not hear from us again, unsubscribe here: ${unsubscribeUrl}`].join('\n\n');
  const html = [
    '<!doctype html><html><body style="margin:0;background:#ffffff;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',Arial,sans-serif"><div style="max-width:600px;padding:32px;margin:auto;font-size:16px;line-height:1.6"><img src="https://loveleedaystudios.com/site/assets/mark-ink-512.png" width="32" height="32" alt="LOVELEEDAY" style="display:block;margin-bottom:24px">',
    ...paras.map((p) => `<p>${esc(p)}</p>`),
    `<p><a href="${esc(unsubscribeUrl)}" style="display:inline-block;background:#0071e3;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none">Unsubscribe</a></p><p style="font-size:13px;color:#62656c;overflow-wrap:anywhere">${esc(unsubscribeUrl)}</p><p style="color:#62656c;font-size:12px;line-height:1.5;margin-top:24px;border-top:1px solid #e4e5e9;padding-top:20px">LOVELEEDAY Studios LLC · loveleedaystudios.com · ${esc(address)}</p></div></body></html>`,
  ].join('\n');
  return {
    from: 'LOVELEEDAY <hello@loveleedaystudios.com>', replyTo: 'hello@loveleedaystudios.com', to: msg.to_email, subject: msg.subject, text, html, unsubscribeUrl,
    headers: { 'List-Unsubscribe': lu, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}
