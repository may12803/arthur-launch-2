import { ChatSurfaceHost } from './_components/ChatSurfaceHost';

// Force dynamic — ChatSurfaceHost uses useSearchParams (?chat=<id>) so the
// home page can't be statically prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Home() {
  return <ChatSurfaceHost />;
}
