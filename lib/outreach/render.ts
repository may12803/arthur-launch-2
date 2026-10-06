// Renders exactly what would go out: text + HTML (<p> paragraphs, never hard-wrapped lines), the physical-address
// footer, the unsubscribe link, and the RFC 8058 headers. Refuses to render when the postal address or the token
// secret is unset, so a "sendable" message can never exist without them (dry-run included: preview == reality).
import { createHash, createHmac } from 'node:crypto';
import { emailDocument, renderEmailLayout } from '../email/layout.ts';
import type { OutreachConfig } from './config.ts';
import type { Message } from './store.ts';

export class RenderError extends Error {
  code: 'no_postal_address' | 'no_token_secret' | 'empty_body';
  constructor(code: RenderError['code'], message: string) { super(message); this.code = code; }
}

// Deterministic per-contact token (HMAC), so a dry run shows the real link. Only its sha256 is stored.
export const unsubscribeToken = (secret: string, contactId: string) => createHmac('sha256', secret).update(`unsub:${contactId}`).digest('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

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
  const body = paras.filter((p) => !/^(?:Arthur|Daniel|Warmly,|The LOVELEEDAY team|\{\{SIGNATURE\}\})$/i.test(p.trim()));
  const footer = `LOVELEEDAY Studios LLC · loveleedaystudios.com`;
  const unsubscribe = `If you would rather not hear from us again, unsubscribe here: ${unsubscribeUrl}`;
  const signoff = 'Warmly,\nDaniel May\nLOVELEEDAY';
  const text = [...body, signoff, footer, address, unsubscribe].join('\n\n');
  const html = emailDocument(renderEmailLayout(body, { signoff, extraFooter: [address], unsubscribeUrl }));
  return {
    from: 'Daniel May, LOVELEEDAY <hello@loveleedaystudios.com>', replyTo: 'hello@loveleedaystudios.com', to: msg.to_email, subject: msg.subject, text, html, unsubscribeUrl,
    headers: { 'List-Unsubscribe': lu, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}
