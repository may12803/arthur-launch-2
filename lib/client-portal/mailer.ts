import { Resend } from "resend";

const HELLO = "hello@loveleedaystudios.com";
const LOGO = "https://loveleedaystudios.com/site/assets/mark-ink-512.png";
const SITE = "https://loveleedaystudios.com";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const actionUrl = (lines: string[]) => lines.join(" ").match(/https:\/\/[^\s<>"']+/)?.[0]?.replace(/[.,;:!?]+$/, "");

export async function sendPortalMail(to: string | string[], subject: string, lines: string[], security = false): Promise<boolean> {
  const recipients = Array.isArray(to) ? to : [to];
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[portal-mail] missing RESEND_API_KEY", { to: recipients, template: subject });
    return false;
  }
  const url = actionUrl(lines);
  const postal = process.env.LOVELEEDAY_POSTAL_ADDRESS?.trim();
  const footer = `LOVELEEDAY Studios LLC · ${SITE}${postal ? ` · ${postal}` : ""}`;
  const text = [...lines, ...(url ? [url] : []), footer].join("\n\n");
  const paragraphs = lines.map((line) => `<p style="margin:0 0 16px">${escapeHtml(line)}</p>`).join("");
  const button = url ? `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0071e3;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none">Open in LOVELEEDAY</a></p><p style="font-size:13px;color:#62656c;overflow-wrap:anywhere">${escapeHtml(url)}</p>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif"><div style="max-width:600px;padding:32px;margin:auto;font-size:16px;line-height:1.6"><img src="${LOGO}" width="32" height="32" alt="LOVELEEDAY" style="display:block;margin-bottom:24px">${paragraphs}${button}<p style="border-top:1px solid #e4e5e9;padding-top:20px;margin-top:32px;font-size:12px;color:#62656c">${escapeHtml(footer)}</p></div></body></html>`;
  try {
    const { data, error } = await new Resend(key).emails.send({ from: `LOVELEEDAY <${security ? "security@loveleedaystudios.com" : HELLO}>`, replyTo: HELLO, to: recipients, subject, text, html });
    if (error) {
      console.error("[portal-mail] send failed", { to: recipients, template: subject, error: error.message });
      return false;
    }
    console.info("[portal-mail] sent", { to: recipients, template: subject, providerId: data?.id });
    return true;
  } catch (error) {
    console.error("[portal-mail] send failed", { to: recipients, template: subject, error });
    return false;
  }
}
