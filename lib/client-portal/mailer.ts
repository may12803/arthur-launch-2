
const HELLO = "hello@loveleedaystudios.com";
import { emailDocument, renderEmailLayout } from "../email/layout.ts";

const actionUrl = (lines: string[]) => lines.join(" ").match(/https:\/\/[^\s<>"']+/)?.[0]?.replace(/[.,;:!?]+$/, "");

export function renderPortalMail(lines: string[]) {
  const url = actionUrl(lines);
  const paragraphs = lines.map((line) => url ? line.replace(url, "").replace(/(?:Open it here:|Open this link to create your account or sign in, and accept:)\s*$/, "You can open it below.").trim() : line);
  const action = url ? { label: "Open in LOVELEEDAY", url } : undefined;
  const footer = "LOVELEEDAY Studios LLC · loveleedaystudios.com";
  return {
    html: emailDocument(renderEmailLayout(paragraphs, { action })),
    text: [...paragraphs, "Warmly,\nThe LOVELEEDAY team", ...(action ? [`${action.label}: ${url}`] : []), footer].join("\n\n"),
  };
}

export async function sendPortalMail(to: string | string[], subject: string, lines: string[], security = false): Promise<boolean> {
  const recipients = Array.isArray(to) ? to : [to];
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[portal-mail] missing RESEND_API_KEY", { to: recipients, template: subject });
    return false;
  }
  const { html, text } = renderPortalMail(lines);
  try {
    const { Resend } = await import("resend");
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
