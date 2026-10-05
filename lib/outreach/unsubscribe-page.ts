// Minimal confirmation page for the unsubscribe link. Live-site tokens: ink #1d1d1f, muted #7d8088, line #e4e5e9, system sans.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function unsubscribePage(ok: boolean, email?: string): string {
  const title = ok ? 'You are unsubscribed' : 'This link is not valid';
  const lead = ok
    ? `${email ? esc(email) + ' has' : 'This address has'} been removed. You will not receive any more messages from us. Thank you for letting us know, and we wish you well.`
    : 'We could not match this unsubscribe link. If you keep receiving mail from us, reply to any message and ask to be removed, and we will take care of it right away.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} - LOVELEEDAY</title>
<style>body{margin:0;background:#fff;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif}main{max-width:520px;margin:0 auto;padding:96px 24px}h1{font-size:28px;line-height:1.2;margin:0 0 16px;font-weight:600}p{font-size:17px;line-height:1.5;margin:0}hr{border:0;border-top:1px solid #e4e5e9;margin:32px 0 16px}small{color:#7d8088;font-size:13px}</style></head>
<body><main><h1>${title}</h1><p>${lead}</p><hr><small>LOVELEEDAY</small></main></body></html>`;
}
