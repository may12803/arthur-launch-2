import Link from "next/link";
import { notFound } from "next/navigation";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { Eyebrow, PageTitle, Muted, StatusBadge, Card } from "@/components/client-portal/ui";
import { formatDate } from "@/lib/client-portal/format";

export const dynamic = "force-dynamic";

type DeliverableSection = { heading?: string; body?: string };

type DeliverableContent = {
  summary?: string;
  url?: string;
  iframe_url?: string;
  sections?: DeliverableSection[];
};

type DeliverableRow = {
  id: string;
  kind: string;
  title: string;
  slug: string;
  status: string;
  content: DeliverableContent | null;
  updated_at: string;
};

export default async function DeliverablePage({ params }: { params: { slug: string } }) {
  const supabase = await getLoveleedayServer();

  // RLS (deliverables_member_select) scopes this to the caller's own
  // tenant(s) — a slug from another tenant simply returns no row here.
  const { data, error } = await supabase
    .from("deliverables")
    .select("id, kind, title, slug, status, content, updated_at")
    .eq("slug", params.slug)
    .maybeSingle<DeliverableRow>();

  if (error || !data) notFound();

  const content = data.content || {};
  const embedUrl = content.iframe_url || content.url;

  return (
    <div>
      <Link href="/client" className="text-small text-text-muted hover:text-text-active">
        &larr; All deliverables
      </Link>

      <div className="flex items-start justify-between gap-4 mt-4 mb-8">
        <div>
          <Eyebrow>{data.kind}</Eyebrow>
          <PageTitle>{data.title}</PageTitle>
          <Muted>Last updated {formatDate(data.updated_at)}</Muted>
        </div>
        <StatusBadge status={data.status} />
      </div>

      {embedUrl && (
        <Card className="overflow-hidden mb-6">
          <iframe
            src={embedUrl}
            title={data.title}
            className="w-full border-0"
            style={{ height: "80vh" }}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </Card>
      )}

      {!embedUrl && content.summary && (
        <Card className="p-6 mb-6">
          <p className="text-body text-text-main leading-relaxed whitespace-pre-wrap">{content.summary}</p>
        </Card>
      )}

      {!embedUrl && content.sections && content.sections.length > 0 && (
        <div className="flex flex-col gap-4">
          {content.sections.map((section, i) => (
            <Card key={i} className="p-6">
              {section.heading && (
                <h2 className="font-serif text-h3 text-text-active mb-2">{section.heading}</h2>
              )}
              {section.body && (
                <p className="text-body text-text-main leading-relaxed whitespace-pre-wrap">{section.body}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      {!embedUrl && !content.summary && (!content.sections || content.sections.length === 0) && (
        <Card className="p-10 text-center">
          <Muted>This deliverable doesn&apos;t have any content yet.</Muted>
        </Card>
      )}
    </div>
  );
}
