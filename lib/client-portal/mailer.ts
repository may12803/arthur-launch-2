import { Resend } from "resend";

// Security mail for the client portal: share links, one-time codes and staff-
// access notices. Sent from the verified loveleedaystudios.com domain.
const FROM = "LOVELEEDAY <security@loveleedaystudios.com>";

export async function sendPortalMail(to: string | string[], subject: string, lines: string[]): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const text = lines.join("\n\n");
  const html =
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#1d1d1f;font-size:15px;line-height:1.6;max-width:520px">` +
    `<p style="font-size:12px;letter-spacing:.14em;font-weight:650;margin:0 0 24px">LOVELEEDAY</p>` +
    lines.map((l) => `<p style="margin:0 0 16px">${escapeHtml(l).replace(/(https:\/\/\S+)/g, '<a href="$1" style="color:#0066cc">$1</a>')}</p>`).join("") +
    `<p style="font-size:12px;color:#7d8088;margin-top:28px">Sent by LOVELEEDAY Studios. If you weren't expecting this, you can ignore it.</p></div>`;
  const { error } = await new Resend(key).emails.send({ from: FROM, to, subject, text, html });
  return !error;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
