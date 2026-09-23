import { AuthShell } from "@/components/client-portal/AuthShell";
import { ShareOpen } from "@/components/client-portal/ShareOpen";
import { loveleedayAnon } from "@/lib/client-portal/anon";

export const dynamic = "force-dynamic";

type Preview = { document_name: string; company: string; recipient_hint: string; state: string };

// The recipient's landing page. Before verification it shows only what the
// database's share_preview allows: the file name, the sharing company and a
// masked address. The file itself opens only after the emailed code.
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let preview: Preview | null = null;
  if (/^[0-9a-f]{48}$/.test(token)) {
    const { data } = await loveleedayAnon().rpc("share_preview", { p_token: token });
    preview = (Array.isArray(data) ? data[0] : data) || null;
  }

  if (!preview) {
    return (
      <AuthShell eyebrow="Shared document" headline="This link" muted="isn't valid." lead="Check that you opened the whole link from the email.">
        <p className="ll-note">If you think this is a mistake, ask the person who shared it to send it again.</p>
      </AuthShell>
    );
  }
  if (preview.state !== "active") {
    return (
      <AuthShell eyebrow="Shared document" headline="This link" muted={preview.state === "expired" ? "has expired." : "was turned off."}
        lead={`${preview.company} shared "${preview.document_name}" through LOVELEEDAY, but it can no longer be opened.`}>
        <p className="ll-note">Ask {preview.company} to share it again if you still need it.</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell eyebrow="Shared document" headline={`${preview.company}`} muted="shared a file with you."
      lead={`"${preview.document_name}" was shared with ${preview.recipient_hint} through LOVELEEDAY. To open it, confirm it's you with a one-time code sent to that address.`}
      footer={<p className="ll-note">Every open is recorded and visible to {preview.company}. PDFs are marked with your email address and the date.</p>}>
      <ShareOpen token={token} documentName={preview.document_name} recipientHint={preview.recipient_hint} />
    </AuthShell>
  );
}
