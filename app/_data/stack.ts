// Single source of truth for the Stack page + dashboard spend stat.
// Real owned domains (Cloudflare zones + Dabney project) and real vault APIs.
// monthlyCost stays null until Daniel sets it — computeCosts() sums only real values (no fabricated $).

export type Domain = { domain: string; entity: string; registrar: string; status: string };
export type Billing = 'usage' | 'subscription' | 'free';
export type Api = {
  name: string;
  category: string;
  billing: Billing;
  logoDomain: string;     // company domain — logo resolved by <ApiLogo> via Clearbit/favicon
  description: string;    // what it lets Arthur do
  monthlyCost: number | null;
};

export const DOMAINS: Domain[] = [
  { domain: 'drinkswithdabney.com', entity: 'Dabney & Co.', registrar: 'Cloudflare', status: 'Active' },
  { domain: 'dabneyandco.com', entity: 'Dabney & Co.', registrar: 'Cloudflare', status: 'Active' },
  { domain: 'loveleedaystudios.com', entity: 'LOVELEEDAY Studios', registrar: 'Cloudflare', status: 'Active' },
  { domain: 'publicskool.com', entity: 'Public Skool LLC', registrar: 'Cloudflare', status: 'Active' },
];

export const API_CATEGORIES = [
  'AI & LLM',
  'Voice & Comms',
  'Search & Scrape',
  'Images',
  'Infrastructure',
  'Commerce & Business',
  'Travel',
  'Data',
];

export const APIS: Api[] = [
  // AI & LLM
  { name: 'Anthropic', category: 'AI & LLM', billing: 'usage', logoDomain: 'anthropic.com', description: "Claude models — Arthur's primary reasoning + chat brain.", monthlyCost: null },
  { name: 'OpenAI', category: 'AI & LLM', billing: 'usage', logoDomain: 'openai.com', description: 'GPT models + embeddings; alternate reasoning + vector search.', monthlyCost: null },
  { name: 'Groq', category: 'AI & LLM', billing: 'usage', logoDomain: 'groq.com', description: 'Ultra-fast Llama inference for cheap high-volume batch work.', monthlyCost: null },
  { name: 'Cerebras', category: 'AI & LLM', billing: 'usage', logoDomain: 'cerebras.ai', description: 'Fast inference; LLM fallback in the cloud tier ladder.', monthlyCost: null },
  { name: 'DeepSeek', category: 'AI & LLM', billing: 'usage', logoDomain: 'deepseek.com', description: 'Low-cost coding + reasoning model.', monthlyCost: null },
  { name: 'Mistral', category: 'AI & LLM', billing: 'usage', logoDomain: 'mistral.ai', description: 'Open-weight LLM option.', monthlyCost: null },
  { name: 'Perplexity', category: 'AI & LLM', billing: 'usage', logoDomain: 'perplexity.ai', description: 'Web-grounded answer engine for live research.', monthlyCost: null },
  { name: 'OpenRouter', category: 'AI & LLM', billing: 'usage', logoDomain: 'openrouter.ai', description: 'One gateway to many third-party models.', monthlyCost: null },
  { name: 'Google Gemini', category: 'AI & LLM', billing: 'usage', logoDomain: 'gemini.google.com', description: "Google's multimodal LLM for select lobes.", monthlyCost: null },
  { name: 'HuggingFace', category: 'AI & LLM', billing: 'usage', logoDomain: 'huggingface.co', description: 'Open models + hosted inference endpoints.', monthlyCost: null },
  { name: 'Pioneer', category: 'AI & LLM', billing: 'usage', logoDomain: 'pioneer.ai', description: 'Agent squad / model access.', monthlyCost: null },
  { name: 'Replicate', category: 'AI & LLM', billing: 'usage', logoDomain: 'replicate.com', description: 'Hosted ML models — image, video, audio.', monthlyCost: null },
  { name: 'Modal', category: 'AI & LLM', billing: 'usage', logoDomain: 'modal.com', description: "Serverless GPU compute that runs Arthur's models + jobs.", monthlyCost: null },
  // Voice & Comms
  { name: 'ElevenLabs', category: 'Voice & Comms', billing: 'subscription', logoDomain: 'elevenlabs.io', description: "Realistic text-to-speech — Arthur's voice.", monthlyCost: null },
  { name: 'Vapi', category: 'Voice & Comms', billing: 'usage', logoDomain: 'vapi.ai', description: 'Real-time two-way voice agent (phone / voice Arthur).', monthlyCost: null },
  { name: 'Telnyx', category: 'Voice & Comms', billing: 'usage', logoDomain: 'telnyx.com', description: 'Programmable telephony + SMS.', monthlyCost: null },
  { name: 'Telegram', category: 'Voice & Comms', billing: 'free', logoDomain: 'telegram.org', description: "Arthur's Telegram chat surface.", monthlyCost: null },
  { name: 'Nylas', category: 'Voice & Comms', billing: 'subscription', logoDomain: 'nylas.com', description: 'Unified email + calendar API (the Inbox).', monthlyCost: null },
  { name: 'Resend', category: 'Voice & Comms', billing: 'subscription', logoDomain: 'resend.com', description: 'Transactional email sending (Dabney confirmations).', monthlyCost: null },
  // Search & Scrape
  { name: 'Exa', category: 'Search & Scrape', billing: 'usage', logoDomain: 'exa.ai', description: 'Neural / semantic web search.', monthlyCost: null },
  { name: 'Tavily', category: 'Search & Scrape', billing: 'usage', logoDomain: 'tavily.com', description: 'Agent-optimized web search.', monthlyCost: null },
  { name: 'SerpAPI', category: 'Search & Scrape', billing: 'usage', logoDomain: 'serpapi.com', description: 'Structured Google search results.', monthlyCost: null },
  { name: 'Firecrawl', category: 'Search & Scrape', billing: 'usage', logoDomain: 'firecrawl.dev', description: 'Turns any site into clean markdown for the LLM.', monthlyCost: null },
  { name: 'Apify', category: 'Search & Scrape', billing: 'usage', logoDomain: 'apify.com', description: 'Web scraping + automation actors.', monthlyCost: null },
  { name: 'Browserbase', category: 'Search & Scrape', billing: 'usage', logoDomain: 'browserbase.com', description: 'Hosted headless browsers for automation.', monthlyCost: null },
];

APIS.push(
  // Images
  { name: 'Recraft', category: 'Images', billing: 'usage', logoDomain: 'recraft.ai', description: 'AI image generation — brand + photographic.', monthlyCost: null },
  // Infrastructure
  { name: 'Cloudflare', category: 'Infrastructure', billing: 'subscription', logoDomain: 'cloudflare.com', description: 'DNS, R2 storage, CDN, and domain registrar.', monthlyCost: null },
  { name: 'Fly.io', category: 'Infrastructure', billing: 'usage', logoDomain: 'fly.io', description: 'Hosts the Arthur backend + this dashboard.', monthlyCost: null },
  { name: 'Vercel', category: 'Infrastructure', billing: 'subscription', logoDomain: 'vercel.com', description: 'Hosts the Dabney site + front-ends.', monthlyCost: null },
  { name: 'Supabase', category: 'Infrastructure', billing: 'subscription', logoDomain: 'supabase.com', description: 'Postgres DB, auth, storage (guest CDP + app data).', monthlyCost: null },
  // Commerce & Business
  { name: 'Stripe', category: 'Commerce & Business', billing: 'usage', logoDomain: 'stripe.com', description: 'Payments, subscriptions, payouts.', monthlyCost: null },
  { name: 'Toast', category: 'Commerce & Business', billing: 'subscription', logoDomain: 'toasttab.com', description: 'Restaurant POS — Dabney menu, orders, gift cards.', monthlyCost: null },
  { name: 'Xero', category: 'Commerce & Business', billing: 'subscription', logoDomain: 'xero.com', description: 'Accounting + bookkeeping (Dabney + Aspen).', monthlyCost: null },
  { name: 'Etsy', category: 'Commerce & Business', billing: 'usage', logoDomain: 'etsy.com', description: 'Marketplace listings.', monthlyCost: null },
  { name: 'Klarna', category: 'Commerce & Business', billing: 'usage', logoDomain: 'klarna.com', description: 'Buy-now-pay-later / payments.', monthlyCost: null },
  { name: 'Meta', category: 'Commerce & Business', billing: 'free', logoDomain: 'meta.com', description: 'Facebook + Instagram Pages API.', monthlyCost: null },
  { name: 'Soundtrack Your Brand', category: 'Commerce & Business', billing: 'subscription', logoDomain: 'soundtrackyourbrand.com', description: 'Licensed in-venue music for Dabney.', monthlyCost: null },
  // Travel
  { name: 'Duffel', category: 'Travel', billing: 'usage', logoDomain: 'duffel.com', description: 'Flight search + booking.', monthlyCost: null },
  { name: 'Viator', category: 'Travel', billing: 'usage', logoDomain: 'viator.com', description: 'Tours + experiences booking.', monthlyCost: null },
  // Data
  { name: 'FRED', category: 'Data', billing: 'free', logoDomain: 'stlouisfed.org', description: 'Federal Reserve economic data.', monthlyCost: null },
  { name: 'Composio', category: 'Data', billing: 'subscription', logoDomain: 'composio.dev', description: '250+ tool integrations (Gmail, Calendar, etc.) in one API.', monthlyCost: null },
  { name: 'PostHog', category: 'Data', billing: 'subscription', logoDomain: 'posthog.com', description: 'Product analytics + event tracking.', monthlyCost: null },
);

export function computeCosts() {
  const monthly = APIS.reduce((s, a) => s + (a.monthlyCost ?? 0), 0);
  const hasData = APIS.some((a) => a.monthlyCost !== null);
  return { monthly, daily: monthly / 30, hasData };
}
