import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate, rateLimit } from "@/lib/_auth";
import { buildPersona } from "@/lib/persona/arthur-system-prompt";

export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ConvRow {
  role: string;
  content: string;
  tool_calls?: unknown;
  tool_results?: unknown;
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface LLMResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason?: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

// IP geolocation cache (prevents hammering ipapi on every request)
const _ipGeoCache = new Map<string, { city: string; region: string; ts: number }>();

async function inferLocationFromIP(ip: string): Promise<{ city: string; region: string } | null> {
  if (!ip || ip === "127.0.0.1" || ip.startsWith("::1")) return null;
  const cached = _ipGeoCache.get(ip);
  if (cached && Date.now() - cached.ts < 3600 * 1000) return { city: cached.city, region: cached.region };
  try {
    const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const j = await r.json() as { city?: string; region?: string; region_code?: string; error?: boolean };
    if (j.error || !j.city) return null;
    const region = j.region_code || j.region || "";
    _ipGeoCache.set(ip, { city: j.city, region, ts: Date.now() });
    return { city: j.city, region };
  } catch { return null; }
}

// buildSystemPrompt delegates to the canonical persona module so all chat
// surfaces (dashboard, Telegram, future inbox/voice) share one identity.
function buildSystemPrompt(contextDigest: string, currentLocation?: string | null, toolsEnabled = true): string {
  return buildPersona({
    contextDigest,
    currentLocation: currentLocation ?? undefined,
    surface: "dashboard",
    // Pass empty tools list when this turn is chat-only — prevents Cerebras/Groq
    // (which lack native tool_use protocol) from hallucinating tool-call syntax
    // when given tool definitions in their system prompt.
    tools: toolsEnabled
      ? ["query_inbox", "send_email", "query_calendar_events", "create_calendar_event", "query_legal", "query_brain_graph", "query_memory", "list_recent_actions", "get_weather", "web_search", "live_sports_score", "scrape_url", "validate_email", "convert_currency", "apilayer", "composio_execute", "pipedream_workflow"]
      : [],
  });
}

// Legacy inline prompt — kept only as reference; canonical lives in lib/persona/arthur-system-prompt.ts.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _legacyBuildSystemPrompt(contextDigest: string, currentLocation?: string | null): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const timeStr = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/Detroit", hour: "numeric", minute: "2-digit",
  });

  return `You ARE Arthur. Not Claude, not "an AI assistant," not "a language model." Arthur is Daniel May's autonomous executive — a multi-tier intelligence that runs on top of a hierarchy of underlying models (Cerebras, Groq, Pioneer, DeepSeek, Anthropic Haiku/Sonnet/Opus, Gemini, Kimi, OpenAI). The model under the hood is plumbing; the identity is Arthur.

When asked "who are you" / "describe yourself" / "what are you": you are ARTHUR. Daniel's chief of staff. Built from his corrections, his decisions, his businesses, his voice. NEVER say "I'm Claude built by Anthropic" — that's the underlying model, not you. If pressed about the model, you can say "I'm currently routed through [tier name]" but lead with Arthur.

Today is ${today}, ${timeStr} EDT. Daniel's home base is Kalamazoo, MI.${currentLocation ? `\n\n**Daniel's current location (from his IP): ${currentLocation}.** When he asks about weather, local restaurants, "what's open near me," etc. — DEFAULT to ${currentLocation}, NOT Kalamazoo. Pass that as the location arg to get_weather and similar tools.` : ""}

Daniel runs:
- Dabney & Co — cocktail bar & lounge, southern contemporary cuisine, Kalamazoo MI (Public Skool LLC DBA)
- olldae — bar operating system SaaS (inventory, recipes, catering, Stripe billing). LOVELEEDAY Studios product.
- Aspen & May — Delaware holding company
- LOVELEEDAY Studios — agency face; Arthur builds, Daniel delivers. Clients never know Arthur exists.
- Essex Brownell — day job, pricing analyst, commodity monitoring, supplier negotiations

Kristie is Daniel's WIFE, not daughter. P0 priority on all channels.

TOOLS AVAILABLE: query_inbox, query_legal, query_brain_graph, query_memory, list_recent_actions, get_weather, browserbase_search (DEFAULT for web discovery / current events / news), browserbase_fetch (DEFAULT for reading any URL — renders JS-heavy pages → markdown), web_search (Perplexity citations — use ONLY when answer needs cited synthesis: medical/financial/legal/scientific claims), live_sports_score.

TOOL ROUTING RULES — pick the RIGHT tool for the question:
- query_inbox / query_legal / query_brain_graph / query_memory / list_recent_actions = DANIEL'S DATA only (his emails, his contracts, his notes graph, his memory log, his recent activity). NEVER use these for general world knowledge.
- web_search = current world facts: politics, sports, public figures, market prices, company info, news, anything that changes over time. Your training data is stale (cutoff is months/years old). For ANY factual question outside Daniel's personal data, use web_search instead of answering from memory.
- get_weather = weather lookups.

Examples of correct routing:
- "who is the president" → web_search (NOT query_brain_graph — that's Daniel's notes!)
- "what's apple's stock price" → web_search
- "what time is the super bowl" → web_search
- "what did the inbox tell me about the lease" → query_inbox + query_legal
- "what did I decide about pricing last week" → query_memory + query_brain_graph
- "what's the weather" → get_weather
- "what's the cavs score" / "game score" / any in-progress game → **live_sports_score** (NOT web_search — Perplexity returns stale pre-game previews mid-game)

When Daniel asks you to look something up — DO it. Don't describe what you would do, call the tool and report what you found.

CRITICAL — TOOLS ARE INVOKED, NOT DESCRIBED:
You MUST invoke tools through the API's native tool_use mechanism. NEVER write tool calls as PLAIN TEXT in your reply. The following are FORBIDDEN as text in your response:
  ❌ "web_search('current Bitcoin price')"
  ❌ "*Performs web search...*"
  ❌ "Let me check live_sports_score..."
  ❌ "Calling get_weather('Kalamazoo, MI')"
  ❌ Any pseudo-code, function-call syntax, or italic action text describing tool use
Either invoke the tool through the actual tool_use protocol (which produces a tool_call structured output, NOT text), OR if the tool genuinely cannot answer, give your best honest answer and say "I'd need to search/fetch X to verify." Writing fake tool calls in text is the worst form of dishonesty — it looks like you did the work when you didn't.

For ANY factual lookup (current price, today's weather, live score, who's the president, latest news), the correct path is: emit the tool_use call → receive tool_result → THEN write your text answer using that data. If your first attempt would have been to write the tool call as text, STOP and use the actual tool mechanism instead.
When asked to "audit" something: call query_memory + list_recent_actions first, then synthesize concrete observations from the ACTUAL data returned.
Never claim "yes" without verifying via tool. If you cannot verify, say so explicitly.
Never answer factual world questions (politics, current events, public figures, prices, dates of upcoming events) from your training data — use web_search.

Format: clean prose or tight bullets. No preamble, no "Great question!", no hedge words unless you mean them. Contractions and real opinions.

CURRENT STATE:
${contextDigest}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool definitions (OpenAI format)
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "query_inbox",
      description: "Search Daniel's email inbox (arthur_inbox_emails). Filter by entity if Daniel asks about a specific mailbox: dabney = daniel.may@drinkswithdabney.com, personal = blackmarble.m.g@gmail.com, yahoo = may.dj@yahoo.com, loveleeday = arthur@loveleedaystudios.com or daniel@loveleedaystudios.com.",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string", description: "Keyword to search subject/body/summary" },
          entity: { type: "string", enum: ["dabney", "personal", "yahoo", "loveleeday", "all"], description: "Filter by mailbox. Default 'all'." },
          intent: { type: "string", description: "Intent filter: catering, vendor_invoice, personal, newsletter, cold_sales, legal, etc." },
          folder: { type: "string", description: "Folder/label filter: inbox, flagged, sent, archived" },
          limit: { type: "number", description: "Max results (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_legal",
      description: "Search legal documents vault (legal_documents table). Use for: 'any contracts for X', 'what legal docs do we have', 'expiring docs', etc.",
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string", description: "Entity name: Aspen & May, LOVELEEDAY, Dabney, olldae, etc." },
          category: { type: "string", description: "Document category" },
          q: { type: "string", description: "Keyword to search title/description" },
          expiring_in_days: { type: "number", description: "Only docs expiring within N days" },
          limit: { type: "number", description: "Max results (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_brain_graph",
      description: "Read the knowledge/brain graph summary stored in Supabase. Use for: 'audit my brain graph', 'what connections exist', 'what topics are covered', etc.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Filter nodes/edges by topic keyword" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_memory",
      description: "Search Arthur's memory index — the index of all knowledge files, feedback rules, and project state files. Use this for ANY question about what Arthur knows, what's been decided, or what projects exist.",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string", description: "Search query — will full-text search name + description" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_actions",
      description: "Show what Arthur has done recently — inbox automation actions, recent Telegram conversations, and dashboard chat. Use for: 'what have you done today', 'recent activity', etc.",
      parameters: {
        type: "object",
        properties: {
          hours: { type: "number", description: "Look back N hours (default 24)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "live_sports_score",
      description: "Get LIVE in-game score for an NBA, NFL, MLB, or NHL game in progress. Returns score, period, clock. Use this for ANY question about a current game's score — DO NOT use web_search for live sports (Perplexity indexes news articles which don't update mid-game).",
      parameters: {
        type: "object",
        properties: {
          league: { type: "string", enum: ["nba", "nfl", "mlb", "nhl"], description: "League: nba, nfl, mlb, or nhl" },
          team: { type: "string", description: "Optional team filter — abbreviation (CLE) or city/name (Cavaliers, Cleveland). Returns matching games only." },
        },
        required: ["league"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Cited research synthesis via Perplexity — use ONLY when the answer needs source citations the user will judge (medical, financial, legal, scientific claims) or when comparing multiple authoritative sources. For everyday lookups (news, what's happening, today's headlines, current prices, quick facts) prefer browserbase_search (faster, raw URLs) or browserbase_fetch (a specific page). Default DOWN the ladder: browserbase first, web_search only when citations matter.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query — phrase as a question if it's factual lookup." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather + short-term forecast for a location. Defaults to Kalamazoo, MI (Daniel's location). Returns temperature, conditions, wind, and next-24h outlook.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City + state, e.g. 'Kalamazoo, MI' or 'Chicago, IL'. Defaults to Kalamazoo, MI." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apilayer",
      description: "Call any APILayer marketplace API for structured data: currency conversion, exchange rates, news headlines, IP geolocation, company data, VAT validation, email validation, phone number validation, weather (alt source), and 50+ others. Use for STRUCTURED data lookups where web_search would return unstructured text. Examples: convert USD to EUR, validate an email, get headlines on a topic.",
      parameters: {
        type: "object",
        properties: {
          api: {
            type: "string",
            description: "Which APILayer API to call. Common: 'currency_data' (currency conversion), 'exchangerates_data' (FX rates), 'mediastack' (news), 'ip_to_location' (IP geolocation), 'companies_data' (company info), 'email_verification' (validate email), 'number_verification' (validate phone), 'vat_validation' (EU VAT lookup), 'weatherstack' (weather), 'spam_check' (spam score)",
          },
          endpoint: { type: "string", description: "Specific endpoint within the API, e.g. 'convert' for currency_data, 'live' for exchangerates_data, 'news' for mediastack" },
          params: { type: "object", description: "Query parameters as JSON object — refer to apilayer.com docs for the chosen API" },
        },
        required: ["api", "endpoint"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_calendar_events",
      description: "Read upcoming or recent calendar events from Daniel's Google Calendar (all connected accounts) and iCloud calendar. Use for 'what's on my calendar', 'any meetings today/this week', 'when is X scheduled', etc. Defaults to next 7 days if no range given.",
      parameters: {
        type: "object",
        properties: {
          days_ahead: { type: "number", description: "Look forward N days from now (default 7)" },
          days_back: { type: "number", description: "Look back N days from now (default 0)" },
          q: { type: "string", description: "Optional keyword filter on event title/description" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a calendar event on Daniel's Google Calendar. Per Daniel's rule, ALL auto-generated events (reservations, tickets, appointments, travel, meetings) go to daniel.may@drinkswithdabney.com — NOT his personal Gmail. Only override 'email' if Daniel specifically asks for a different calendar.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title — keep it short and clear" },
          start: { type: "string", description: "ISO 8601 start datetime (e.g. 2026-05-08T19:00:00)" },
          end: { type: "string", description: "ISO 8601 end datetime" },
          description: { type: "string", description: "Optional event description / notes" },
          location: { type: "string", description: "Optional location (address or virtual meeting URL)" },
          attendees: { type: "array", items: { type: "string" }, description: "Optional list of attendee email addresses" },
          email: { type: "string", description: "Optional Google account email to create on (default: daniel.may@drinkswithdabney.com per Arthur rule)" },
        },
        required: ["title", "start", "end"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email from one of Daniel's connected mailboxes via Nylas. PREFER this over composio_execute(GMAIL_SEND_EMAIL) for Gmail/Yahoo — Nylas is already running daily for inbox sync. Pick the mailbox via 'entity': 'dabney' = daniel.may@drinkswithdabney.com, 'personal' = blackmarble.m.g@gmail.com, 'yahoo' = may.dj@yahoo.com, 'loveleeday' = arthur@loveleedaystudios.com (uses Resend, owned domain). Match the entity to what Daniel asked about: Dabney work → 'dabney', personal → 'personal', LOVELEEDAY/agency/hustle → 'loveleeday'. Default to 'personal' if unclear, but ASK first if it's a real outbound to a real recipient.",
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string", enum: ["dabney", "personal", "yahoo", "loveleeday"], description: "Which mailbox to send from. Match to the business context of the message." },
          to: { type: "string", description: "Recipient email address (or comma-separated list)" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body. Plain text or HTML — Nylas auto-detects." },
          cc: { type: "string", description: "Optional CC recipients (comma-separated)" },
          bcc: { type: "string", description: "Optional BCC recipients (comma-separated)" },
        },
        required: ["entity", "to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "composio_execute",
      description: "Take an action on Daniel's connected SaaS apps via Composio (982+ toolkits). Use this to ACTUALLY DO things — send emails, create calendar events, post to Slack, create Notion pages, update Linear issues, charge Stripe, query Xero, etc. Common actions: 'GMAIL_SEND_EMAIL', 'GOOGLECALENDAR_CREATE_EVENT', 'NOTION_CREATE_PAGE', 'SLACK_SEND_MESSAGE', 'STRIPE_CREATE_PAYMENT_INTENT', 'XERO_LIST_INVOICES', 'GITHUB_CREATE_ISSUE', 'LINEAR_CREATE_ISSUE'. Use this INSTEAD of describing what you would do.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "The Composio action slug (UPPER_SNAKE_CASE). Examples: GMAIL_SEND_EMAIL, GOOGLECALENDAR_CREATE_EVENT, NOTION_CREATE_PAGE, STRIPE_LIST_CHARGES." },
          params: { type: "object", description: "Action parameters per Composio's schema. e.g. for GMAIL_SEND_EMAIL: {recipient_email, subject, body}." },
          entity_id: { type: "string", description: "Optional Composio entity (defaults to 'daniel'). Used for multi-tenant setups." },
        },
        required: ["action", "params"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scrape_url",
      description: "Fetch the actual rendered HTML of a webpage via APILayer scrapestack proxy (35M IPs, JS rendering). Use when web_search snippets aren't enough — competitor pricing pages, product pages, OpenTable listings, vendor catalogs, anything where you need the full page content. Returns the page HTML/text.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full URL to scrape" },
          render_js: { type: "boolean", description: "Set true if the page uses JS to render content (React/Vue SPAs). Costs more credits but works on dynamic sites." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validate_email",
      description: "Validate an email address via APILayer mailboxlayer — checks format, MX records, SMTP, role-based detection, free-mail flag. Use BEFORE send_email to known-suspect addresses (catering inquiries from unknown senders, vendor onboarding, etc.) to avoid bounces.",
      parameters: {
        type: "object",
        properties: { email: { type: "string", description: "Email address to validate" } },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_currency",
      description: "Convert an amount between currencies using APILayer currencylayer (real-time FX, 168 currencies). Use for vendor invoices in foreign currency, international quotes, etc.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Source currency (3-letter code, e.g. USD, EUR, GBP)" },
          to: { type: "string", description: "Target currency code" },
          amount: { type: "number", description: "Amount to convert" },
        },
        required: ["from", "to", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pipedream_workflow",
      description: "Trigger a Pipedream workflow that exposes a niche SaaS app NOT in Composio: Toast POS, OpenTable, Resy, HoneyBook, Square, Mindbody, Acuity, Calendly. Each workflow is an HTTP endpoint that takes JSON in, returns JSON out. Use this for hospitality / scheduling apps that Composio doesn't cover.",
      parameters: {
        type: "object",
        properties: {
          workflow: { type: "string", description: "The workflow alias (configured in PIPEDREAM_WORKFLOWS env JSON). Examples: 'toast_daily_revenue', 'opentable_tonight_count', 'honeybook_pending_invoices'." },
          payload: { type: "object", description: "JSON payload sent to the workflow. Workflow-specific schema." },
        },
        required: ["workflow"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browserbase_search",
      description: "Agent-grade web search via Browserbase Search API — returns clean URL list with titles + snippets, ~1s. Use for: finding sources, 'find me 5 sites about X', discovery before browserbase_fetch. Faster than web_search and gives raw URLs not LLM summaries.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          num: { type: "number", description: "Max results (default 8, max 20)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browserbase_fetch",
      description: "Render JS-heavy pages (Reddit, Notion, dashboards, modern SPAs) and extract clean Markdown via Browserbase Fetch API. Use this INSTEAD of scrape_url for content-heavy modern sites — returns markdown not raw HTML, much more token-efficient.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch + render" },
        },
        required: ["url"],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tool implementations
// ─────────────────────────────────────────────────────────────────────────────

async function toolQueryInbox(args: { q?: string; entity?: string; intent?: string; folder?: string; limit?: number }): Promise<string> {
  try {
    const db = getSupabaseAdmin();
    let query = db
      .from("arthur_inbox_emails")
      .select("id,subject,from_name,from_email,to_email,received_at,label,classification,is_read,direction")
      .eq("is_deleted", false)
      .order("received_at", { ascending: false })
      .limit(args.limit ?? 10);

    if (args.q) {
      query = query.or(`subject.ilike.%${args.q}%,body_text.ilike.%${args.q}%`);
    }
    if (args.intent) {
      query = query.eq("classification->>intent", args.intent);
    }
    if (args.folder) {
      query = query.eq("label", args.folder);
    }
    // Entity → to_email filter. Maps to the canonical mailbox addresses.
    if (args.entity && args.entity !== "all") {
      const entityToEmail: Record<string, string | string[]> = {
        dabney: "daniel.may@drinkswithdabney.com",
        personal: "blackmarble.m.g@gmail.com",
        yahoo: "may.dj@yahoo.com",
        loveleeday: ["arthur@loveleedaystudios.com", "daniel@loveleedaystudios.com"],
      };
      const targetEmail = entityToEmail[args.entity];
      if (targetEmail) {
        if (Array.isArray(targetEmail)) query = query.in("to_email", targetEmail);
        else query = query.eq("to_email", targetEmail);
      }
    }

    const { data, error } = await query;
    if (error) return `DB error: ${error.message}`;
    if (!data || data.length === 0) return "No matching emails found.";

    // Also get summary counts
    const { count: unread } = await db
      .from("arthur_inbox_emails")
      .select("*", { count: "exact", head: true })
      .eq("is_deleted", false)
      .eq("is_read", false)
      .eq("direction", "inbound");

    const summary = unread != null ? `Inbox summary: ${unread} unread inbound emails.\n\n` : "";
    const rows = data.map((e: Record<string, unknown>) => {
      const cls = e.classification as Record<string, unknown> | null;
      const intent = cls?.intent ?? "unclassified";
      const urgency = cls?.urgency ?? "";
      return `• ${(e.subject as string) || "(no subject)"} — from ${(e.from_name as string) || (e.from_email as string)} (${String(e.received_at ?? "").slice(0, 10)}) [${intent}${urgency ? ` ${urgency}` : ""}]`;
    });
    return summary + rows.join("\n");
  } catch (e: unknown) {
    return `query_inbox error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function toolQueryLegal(args: { entity?: string; category?: string; q?: string; expiring_in_days?: number; limit?: number }): Promise<string> {
  try {
    const db = getSupabaseAdmin();
    let query = db
      .from("legal_documents")
      .select("id,title,entity,category,effective_date,expires_at,description,extraction_status")
      .eq("is_archived", false)
      .order("uploaded_at", { ascending: false })
      .limit(args.limit ?? 10);

    if (args.entity) query = query.ilike("entity", `%${args.entity}%`);
    if (args.category) query = query.ilike("category", `%${args.category}%`);
    if (args.q) query = query.or(`title.ilike.%${args.q}%,description.ilike.%${args.q}%`);
    if (args.expiring_in_days) {
      const cutoff = new Date(Date.now() + args.expiring_in_days * 86400000).toISOString().slice(0, 10);
      query = query.lte("expires_at", cutoff).not("expires_at", "is", null);
    }

    const { data, error } = await query;
    if (error) return `DB error: ${error.message}`;

    // Count distinct entities
    const { data: entityData } = await db
      .from("legal_documents")
      .select("entity")
      .eq("is_archived", false);
    const distinctEntities = new Set((entityData ?? []).map((r: Record<string, unknown>) => r.entity)).size;
    const totalDocs = (entityData ?? []).length;

    if (!data || data.length === 0) {
      return `Legal vault: ${totalDocs} docs across ${distinctEntities} entities. No docs match your filter.`;
    }
    const rows = (data as Record<string, unknown>[]).map(d =>
      `• ${d.title} — ${d.entity ?? "n/a"} | ${d.category ?? "n/a"}${d.expires_at ? ` | expires ${d.expires_at}` : ""}`
    );
    return `Legal vault: ${totalDocs} total docs across ${distinctEntities} entities.\n\n${rows.join("\n")}`;
  } catch (e: unknown) {
    return `query_legal error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function toolQueryBrainGraph(args: { topic?: string }): Promise<string> {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("arthur_brain_graph_summary")
      .select("nodes,edges,stats,synced_at")
      .eq("id", 1)
      .single();

    if (error || !data) {
      return `{ "ok": false, "message": "Brain graph data not yet synced to arthur-online — the live graph lives at ~/arthur/data/knowledge-graph.json on Mac. Run a sync script to populate the arthur_brain_graph_summary table.", "fallback": "Memory index has ${await getMemoryCount()} entries covering: Arthur system, Dabney & Co, olldae, accounting, Essex Brownell, LOVELEEDAY, feedback rules." }`;
    }

    const nodes = (data.nodes as unknown[]) ?? [];
    const edges = (data.edges as unknown[]) ?? [];
    const stats = (data.stats as Record<string, unknown>) ?? {};
    const synced = data.synced_at ? `Synced: ${data.synced_at}` : "Never synced from Mac";

    if (nodes.length === 0) {
      return `Brain graph is in Supabase but has no nodes yet. ${synced}. The live graph is at ~/arthur/data/knowledge-graph.json — populate via sync script.\n\nFallback: Memory index covers ${await getMemoryCount()} entries across 8 categories.`;
    }

    // Filter by topic if provided
    let filteredNodes = nodes as Array<{ id?: string; label?: string; type?: string }>;
    let filteredEdges = edges as Array<{ source?: string; target?: string; relation?: string }>;
    if (args.topic) {
      const t = args.topic.toLowerCase();
      filteredNodes = filteredNodes.filter(n =>
        (n.id ?? "").toLowerCase().includes(t) ||
        (n.label ?? "").toLowerCase().includes(t) ||
        (n.type ?? "").toLowerCase().includes(t)
      );
      const nodeIds = new Set(filteredNodes.map(n => n.id));
      filteredEdges = filteredEdges.filter(e => nodeIds.has(e.source) || nodeIds.has(e.target));
    }

    const nodeList = filteredNodes.slice(0, 30).map(n => `${n.label ?? n.id} (${n.type ?? "node"})`).join(", ");
    const edgeList = filteredEdges.slice(0, 20).map(e => `${e.source} → ${e.relation ?? "relates"} → ${e.target}`).join("\n");

    return `Brain graph: ${nodes.length} nodes, ${edges.length} edges. ${synced}.
Stats: ${JSON.stringify(stats)}

${args.topic ? `Filtered to "${args.topic}" — ${filteredNodes.length} nodes, ${filteredEdges.length} edges:\n` : ""}Nodes (sample): ${nodeList}

Edges (sample):\n${edgeList || "(none)"}`;
  } catch (e: unknown) {
    return `query_brain_graph error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function getMemoryCount(): Promise<number> {
  try {
    const db = getSupabaseAdmin();
    const { count } = await db.from("arthur_memory_index").select("*", { count: "exact", head: true });
    return count ?? 0;
  } catch { return 0; }
}

async function toolQueryMemory(args: { q?: string }): Promise<string> {
  try {
    const db = getSupabaseAdmin();
    let query = db
      .from("arthur_memory_index")
      .select("name,description,category,file_path")
      .order("category");

    if (args.q) {
      // Use Postgres full-text search
      query = db
        .from("arthur_memory_index")
        .select("name,description,category,file_path")
        .or(`name.ilike.%${args.q}%,description.ilike.%${args.q}%`)
        .order("category");
    }

    const { data, error } = await query.limit(30);
    if (error) return `DB error: ${error.message}`;
    if (!data || data.length === 0) return `No memory entries match "${args.q ?? ""}".`;

    // Group by category
    const byCategory: Record<string, Array<{ name: string; description: string }>> = {};
    for (const row of data as Array<{ name: string; description: string; category: string }>) {
      if (!byCategory[row.category]) byCategory[row.category] = [];
      byCategory[row.category].push({ name: row.name, description: row.description });
    }

    const lines: string[] = [`Memory index: ${data.length} entries${args.q ? ` matching "${args.q}"` : " (sample)"}.\n`];
    for (const [cat, entries] of Object.entries(byCategory)) {
      lines.push(`**${cat}**`);
      for (const e of entries) {
        lines.push(`  • ${e.name} — ${e.description}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  } catch (e: unknown) {
    return `query_memory error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function toolListRecentActions(args: { hours?: number }): Promise<string> {
  try {
    const db = getSupabaseAdmin();
    const hours = args.hours ?? 24;
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const parts: string[] = [];

    // Inbox automation actions
    const { data: actions } = await db
      .from("arthur_inbox_actions")
      .select("action,actor,reasoning,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(15);

    if (actions && actions.length > 0) {
      parts.push(`**Inbox automation (last ${hours}h): ${actions.length} actions**`);
      for (const a of actions as Array<{ action: string; actor: string; reasoning: string; created_at: string }>) {
        parts.push(`  • [${a.created_at.slice(11, 16)}] ${a.action} (${a.actor ?? "auto"}) — ${(a.reasoning ?? "").slice(0, 80)}`);
      }
    } else {
      parts.push(`Inbox automation: 0 actions in the last ${hours}h.`);
    }

    // Recent Telegram turns
    const { data: tgTurns } = await db
      .from("arthur_telegram_conversations")
      .select("role,content,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10);

    if (tgTurns && tgTurns.length > 0) {
      parts.push(`\n**Telegram conversations (last ${hours}h): ${tgTurns.length} turns**`);
      for (const t of (tgTurns as Array<{ role: string; content: string; created_at: string }>).slice(0, 5)) {
        parts.push(`  • [${t.created_at.slice(11, 16)}] ${t.role}: ${t.content.slice(0, 80)}…`);
      }
    }

    // Recent dashboard chat turns
    const { data: dashTurns } = await db
      .from("arthur_dashboard_conversations")
      .select("role,content,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(6);

    if (dashTurns && dashTurns.length > 0) {
      parts.push(`\n**Dashboard chat (last ${hours}h): ${dashTurns.length} turns**`);
      for (const t of (dashTurns as Array<{ role: string; content: string; created_at: string }>).slice(0, 4)) {
        parts.push(`  • [${t.created_at.slice(11, 16)}] ${t.role}: ${t.content.slice(0, 80)}…`);
      }
    }

    return parts.join("\n") || `No recent actions found in the last ${hours}h.`;
  } catch (e: unknown) {
    return `list_recent_actions error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function toolLiveSportsScore(args: { league?: string; team?: string }): Promise<string> {
  const league = (args.league || "nba").toLowerCase();
  const sportPath: Record<string, string> = {
    nba: "basketball/nba",
    nfl: "football/nfl",
    mlb: "baseball/mlb",
    nhl: "hockey/nhl",
  };
  const path = sportPath[league];
  if (!path) return `live_sports_score: unsupported league "${league}". Use nba/nfl/mlb/nhl.`;
  try {
    const r = await fetch(`http://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return `live_sports_score: ESPN returned ${r.status}`;
    const data = await r.json() as { events?: Array<{
      name?: string;
      status?: { type?: { description?: string }; displayClock?: string; period?: number };
      competitions?: Array<{ competitors?: Array<{ team?: { abbreviation?: string; displayName?: string; location?: string }; score?: string }> }>;
    }> };
    let games = data.events ?? [];
    if (args.team) {
      const t = args.team.toLowerCase();
      games = games.filter(g => {
        const teams = g.competitions?.[0]?.competitors ?? [];
        return teams.some(c => {
          const team = c.team || {};
          return [team.abbreviation, team.displayName, team.location].filter(Boolean).some(s => s!.toLowerCase().includes(t));
        });
      });
    }
    if (games.length === 0) return `No ${league.toUpperCase()} games found${args.team ? ` for "${args.team}"` : " today"}.`;
    return games.map(g => {
      const status = g.status?.type?.description ?? "?";
      const clock = g.status?.displayClock ?? "";
      const period = g.status?.period ?? "";
      const teams = g.competitions?.[0]?.competitors ?? [];
      const score = teams.map(c => `${c.team?.abbreviation ?? "?"} ${c.score ?? "0"}`).join(" — ");
      const live = ["In Progress", "Halftime", "End of Period"].includes(status);
      return `**${g.name}**: ${score}  [${status}${live ? `, P${period} ${clock}` : ""}]`;
    }).join("\n");
  } catch (e: unknown) {
    return `live_sports_score error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// Browserbase Search — agent-grade web search via Browserbase's clean URL list
// API. Faster than Perplexity (~1s) and avoids LLM-summary middleware so the
// model sees raw URLs to choose from. Use for "find me 5 sites about X" or as
// a discovery step before browserbase_fetch.
async function toolBrowserbaseSearch(args: { query?: string; num?: number }): Promise<string> {
  const query = args.query?.trim();
  if (!query) return "browserbase_search error: query required";
  const key = process.env.BROWSERBASE_API_KEY;
  if (!key) return "browserbase_search error: BROWSERBASE_API_KEY not set on this deployment";
  try {
    const r = await fetch("https://api.browserbase.com/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BB-API-Key": key },
      body: JSON.stringify({ query, num: Math.min(args.num ?? 8, 20) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return `browserbase_search error: HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`;
    const data = await r.json() as { results?: Array<{ url?: string; title?: string; snippet?: string }> };
    const results = data.results ?? [];
    if (results.length === 0) return "browserbase_search returned no results";
    return results.slice(0, args.num ?? 8).map((r, i) =>
      `[${i+1}] ${r.title ?? "(untitled)"}\n    ${r.url ?? ""}\n    ${(r.snippet ?? "").slice(0, 180)}`
    ).join("\n\n");
  } catch (e: unknown) {
    return `browserbase_search error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// Browserbase Fetch — render JS-heavy pages and extract clean Markdown via
// Browserbase's Fetch API. Replaces scrape_url for modern SPAs (Reddit, Notion,
// dashboards). Returns markdown not raw HTML — token-efficient for the LLM.
async function toolBrowserbaseFetch(args: { url?: string }): Promise<string> {
  const url = args.url?.trim();
  if (!url) return "browserbase_fetch error: url required";
  const key = process.env.BROWSERBASE_API_KEY;
  if (!key) return "browserbase_fetch error: BROWSERBASE_API_KEY not set on this deployment";
  try {
    const r = await fetch("https://api.browserbase.com/v1/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BB-API-Key": key },
      body: JSON.stringify({ url, format: "markdown" }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return `browserbase_fetch error: HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`;
    const data = await r.json() as { markdown?: string; content?: string };
    const out = data.markdown ?? data.content ?? "";
    if (!out) return "browserbase_fetch returned empty content";
    return out.length > 8000 ? out.slice(0, 8000) + "\n\n[…truncated, " + out.length + " chars total]" : out;
  } catch (e: unknown) {
    return `browserbase_fetch error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function toolWebSearch(args: { query?: string }): Promise<string> {
  const query = args.query?.trim();
  if (!query) return "web_search error: query required";
  // Auto-inject Daniel's current location for locality-sensitive queries
  // (gas prices, restaurant hours, "near me", weather without explicit location, etc.)
  // Prevents the "asked about gas, got Virginia prices" failure.
  const localityPattern = /\b(price of gas|gas price|near me|hours|restaurants?|open today|what's open|drive-thru|pharmacy|store hours|cheap|local|nearby)\b/i;
  let augmented = query;
  if (localityPattern.test(query) && !/\b(MI|Michigan|Kalamazoo|IN|Indiana|Fort Wayne|Sawyer|in [A-Z][a-z]+,? [A-Z]{2})\b/i.test(query)) {
    augmented = `${query} in Kalamazoo, Michigan`;
  }
  return runPerplexity(augmented, /* depth */ 0);
}

async function runPerplexity(query: string, depth: number): Promise<string> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return "web_search error: PERPLEXITY_API_KEY not set on this deployment";
  try {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: "You are a search engine. Answer the user's question concisely with the most current, accurate information available. Include the year/date when relevant. Cite sources inline as [1][2]. If asked about an event (game, breaking news, release), include specific facts: scores, names, times, dollar amounts. Do NOT punt to 'check the official site' — pull the facts." },
          { role: "user", content: query },
        ],
        max_tokens: 800,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return `web_search error: perplexity ${r.status}: ${(await r.text()).slice(0, 200)}`;
    const data = await r.json() as { choices?: Array<{ message?: { content?: string } }>; citations?: string[] };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    const citations = data.citations ?? [];

    // Auto-retry once with a sharper query if the first response is suspiciously thin.
    // Trigger: <180 chars total OR contains "I don't have" / "couldn't find" / "no specific" / "check the official".
    const thinSignals = /\b(don'?t have|couldn'?t find|no specific|check the official|not enough information|insufficient|unclear)\b/i;
    if (depth === 0 && (text.length < 180 || thinSignals.test(text))) {
      const sharper = `${query} — give specific facts, names, scores, dates, dollar amounts. Cite sources.`;
      const retried = await runPerplexity(sharper, 1);
      if (retried.length > text.length + 80) return retried;
    }

    if (!text) return "web_search returned empty result";
    const cites = citations.length ? "\n\nSources:\n" + citations.slice(0, 5).map((c, i) => `[${i+1}] ${c}`).join("\n") : "";
    return text + cites;
  } catch (e: unknown) {
    return `web_search error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function toolGetWeather(args: { location?: string }): Promise<string> {
  const rawLocation = args.location?.trim() || "Kalamazoo, MI";
  // Open-Meteo geocoder accepts city names but chokes on "City, State" format.
  // Try city-only first; preserve state for disambiguation in the result match.
  const cityPart = rawLocation.split(",")[0].trim();
  const statePart = rawLocation.includes(",") ? rawLocation.split(",")[1].trim().toUpperCase() : "";
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityPart)}&count=10&language=en&format=json`,
      { signal: AbortSignal.timeout(5000) }
    );
    const geo = await geoRes.json() as { results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string; country_code?: string }> };
    const candidates = geo.results ?? [];
    // Prefer US match with matching state when state is provided
    const place = statePart
      ? (candidates.find(c => c.country_code === "US" && c.admin1?.toUpperCase().startsWith(statePart))
         ?? candidates.find(c => c.country_code === "US")
         ?? candidates[0])
      : candidates[0];
    if (!place) return `Couldn't geocode "${rawLocation}". Try a different city name.`;

    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_gusts_10m` +
      `&hourly=temperature_2m,precipitation_probability,weather_code` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FDetroit&forecast_days=2`,
      { signal: AbortSignal.timeout(5000) }
    );
    const wx = await wxRes.json() as {
      current?: { temperature_2m?: number; apparent_temperature?: number; weather_code?: number; wind_speed_10m?: number; wind_gusts_10m?: number; relative_humidity_2m?: number; precipitation?: number; is_day?: number };
      hourly?: { time?: string[]; temperature_2m?: number[]; precipitation_probability?: number[]; weather_code?: number[] };
    };
    const c = wx.current ?? {};
    const codeMap: Record<number, string> = {
      0:"clear", 1:"mostly clear", 2:"partly cloudy", 3:"overcast",
      45:"fog", 48:"freezing fog", 51:"light drizzle", 53:"drizzle", 55:"heavy drizzle",
      61:"light rain", 63:"rain", 65:"heavy rain", 71:"light snow", 73:"snow", 75:"heavy snow",
      80:"rain showers", 81:"heavy showers", 82:"violent showers", 95:"thunderstorm", 96:"hailstorm", 99:"violent hailstorm",
    };
    const cond = codeMap[c.weather_code ?? -1] ?? `code ${c.weather_code}`;

    const next6 = (wx.hourly?.time ?? []).slice(0, 6).map((t, i) => ({
      time: t.slice(11, 16),
      temp: wx.hourly?.temperature_2m?.[i],
      pop:  wx.hourly?.precipitation_probability?.[i],
    }));
    const popMax = Math.max(0, ...(wx.hourly?.precipitation_probability ?? []).slice(0, 12));

    // Wear / what-to-bring recommendation based on conditions
    const temp = c.apparent_temperature ?? c.temperature_2m ?? 60;
    const wind = c.wind_speed_10m ?? 0;
    const gusts = c.wind_gusts_10m ?? 0;
    const isPrecip = (c.precipitation ?? 0) > 0.01 || /rain|drizzle|shower|snow|thunder|hail/i.test(cond);
    const willPrecip = popMax >= 40;
    const isWindy = wind >= 18 || gusts >= 25;
    const isHot = temp >= 82;
    const isWarm = temp >= 70 && temp < 82;
    const isCool = temp >= 55 && temp < 70;
    const isCold = temp >= 38 && temp < 55;
    const isFreezing = temp < 38;
    const isSunny = (c.is_day ?? 1) === 1 && /clear|mostly clear/i.test(cond);

    const rec: string[] = [];
    if (isFreezing) rec.push("heavy coat, hat, gloves — it's freezing");
    else if (isCold) rec.push("warm jacket — it's cold out");
    else if (isCool) rec.push("light jacket or layer");
    else if (isWarm) rec.push("t-shirt weather");
    else if (isHot) rec.push("light + breathable, hydrate");
    if (isPrecip || willPrecip) rec.push(isPrecip ? "grab the umbrella, it's coming down" : `bring an umbrella (${popMax}% chance)`);
    if (isWindy && !isPrecip) rec.push("wind's pushing — skip the loose hat");
    if (isSunny && (isWarm || isHot)) rec.push("sunglasses");
    const recommendation = rec.length ? `\n→ ${rec.join(" · ")}` : "";

    return [
      `**${place.name}${place.admin1 ? ", " + place.admin1 : ""}** — now`,
      `${Math.round(c.temperature_2m ?? 0)}°F (feels ${Math.round(temp)}°), ${cond}`,
      `Wind ${Math.round(wind)} mph${gusts > wind + 5 ? `, gusts ${Math.round(gusts)}` : ""}, humidity ${c.relative_humidity_2m ?? 0}%`,
      `Next 12h precip chance peak: ${popMax}%`,
      next6.length ? `Hourly: ${next6.map(h => `${h.time} ${Math.round(h.temp ?? 0)}°/${h.pop ?? 0}%`).join(" · ")}` : "",
      recommendation,
    ].filter(Boolean).join("\n");
  } catch (e: unknown) {
    return `get_weather error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool dispatch
// ─────────────────────────────────────────────────────────────────────────────

async function executeTool(name: string, argsStr: string): Promise<string> {
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(argsStr || "{}"); } catch { /* empty args */ }

  switch (name) {
    case "query_inbox":       return toolQueryInbox(args as Parameters<typeof toolQueryInbox>[0]);
    case "query_legal":       return toolQueryLegal(args as Parameters<typeof toolQueryLegal>[0]);
    case "query_brain_graph": return toolQueryBrainGraph(args as Parameters<typeof toolQueryBrainGraph>[0]);
    case "query_memory":      return toolQueryMemory(args as Parameters<typeof toolQueryMemory>[0]);
    case "list_recent_actions": return toolListRecentActions(args as Parameters<typeof toolListRecentActions>[0]);
    case "get_weather":         return toolGetWeather(args as Parameters<typeof toolGetWeather>[0]);
    case "web_search":          return toolWebSearch(args as Parameters<typeof toolWebSearch>[0]);
    case "live_sports_score":   return toolLiveSportsScore(args as Parameters<typeof toolLiveSportsScore>[0]);
    case "send_email":              return toolSendEmail(args as Parameters<typeof toolSendEmail>[0]);
    case "create_calendar_event":   return toolCreateCalendarEvent(args as Parameters<typeof toolCreateCalendarEvent>[0]);
    case "query_calendar_events":   return toolQueryCalendarEvents(args as Parameters<typeof toolQueryCalendarEvents>[0]);
    case "apilayer":            return toolAPILayer(args as Parameters<typeof toolAPILayer>[0]);
    case "scrape_url":          return toolScrapeURL(args as Parameters<typeof toolScrapeURL>[0]);
    case "validate_email":      return toolValidateEmail(args as Parameters<typeof toolValidateEmail>[0]);
    case "convert_currency":    return toolConvertCurrency(args as Parameters<typeof toolConvertCurrency>[0]);
    case "composio_execute":    return toolComposio(args as Parameters<typeof toolComposio>[0]);
    case "pipedream_workflow":  return toolPipedream(args as Parameters<typeof toolPipedream>[0]);
    case "browserbase_search":  return toolBrowserbaseSearch(args as Parameters<typeof toolBrowserbaseSearch>[0]);
    case "browserbase_fetch":   return toolBrowserbaseFetch(args as Parameters<typeof toolBrowserbaseFetch>[0]);
    default:                  return `Unknown tool: ${name}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// APILayer dedicated tools — name-binding so the LLM picks them naturally.
// Each just wraps `apilayer` with the right api/endpoint preset.
// ─────────────────────────────────────────────────────────────────────────────
async function toolScrapeURL(args: { url?: string; render_js?: boolean }): Promise<string> {
  if (!args.url) return "scrape_url error: url required";
  return toolAPILayer({ api: "adv_scraper", endpoint: "api/scrape", params: { url: args.url, ...(args.render_js ? { render_js: 1 } : {}) } });
}
async function toolValidateEmail(args: { email?: string }): Promise<string> {
  if (!args.email) return "validate_email error: email required";
  return toolAPILayer({ api: "email_verification", endpoint: args.email, params: {} });
}
async function toolConvertCurrency(args: { from?: string; to?: string; amount?: number }): Promise<string> {
  const { from, to, amount } = args;
  if (!from || !to || amount === undefined) return "convert_currency error: from, to, amount all required";
  return toolAPILayer({ api: "currency_data", endpoint: "convert", params: { from, to, amount } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Composio — agent-native action layer. 982+ toolkits, OAuth handled by Composio.
// Daniel sets COMPOSIO_API_KEY in Fly secrets. Each Composio "entity" maps to a
// person whose accounts have been authorized — defaults to 'daniel'.
// API: https://backend.composio.dev/api/v1/actions/{ACTION_SLUG}/execute
// ─────────────────────────────────────────────────────────────────────────────
async function toolComposio(args: { action?: string; params?: Record<string, unknown>; entity_id?: string }): Promise<string> {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) return "composio error: COMPOSIO_API_KEY not set on this deployment. Sign up at composio.dev (free tier 20K calls/mo) and run `flyctl secrets set COMPOSIO_API_KEY=xxx -a arthur-online` plus `-a arthur-ai`.";
  const action = args.action?.trim();
  if (!action) return "composio error: 'action' is required (e.g. GMAIL_SEND_EMAIL)";
  const params = args.params ?? {};
  const userId = args.entity_id ?? process.env.COMPOSIO_ENTITY_ID ?? "daniel";
  try {
    const r = await fetch(`https://backend.composio.dev/api/v3/tools/execute/${encodeURIComponent(action)}`, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, arguments: params }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      // 401 likely means action requires connecting an account first — surface honestly.
      if (r.status === 401 || r.status === 404 || /not connected|connection/i.test(body)) {
        return `composio error: action ${action} not available — likely no connected ${action.split("_")[0].toLowerCase()} account for user '${userId}'. Connect via composio.dev dashboard (user=${userId}) or call composio_execute with action 'INITIATE_CONNECTION' first.`;
      }
      return `composio error: ${action} returned ${r.status}: ${body.slice(0, 250)}`;
    }
    const data = await r.json();
    const pretty = JSON.stringify(data, null, 2);
    return pretty.length > 1500 ? pretty.slice(0, 1500) + "\n... (truncated)" : pretty;
  } catch (e) {
    return `composio error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipedream — workflow trigger layer for niche SaaS Composio doesn't cover.
// Workflows are configured in env: PIPEDREAM_WORKFLOWS={"alias":"https://eo...m.pipedream.net"}
// Each alias maps to a Pipedream HTTP-trigger workflow URL. Daniel builds the
// workflow once on pipedream.com (e.g. Toast revenue summary), then registers
// the URL here so Arthur can call it by alias.
// ─────────────────────────────────────────────────────────────────────────────
async function toolPipedream(args: { workflow?: string; payload?: Record<string, unknown> }): Promise<string> {
  const alias = args.workflow?.trim();
  if (!alias) return "pipedream error: 'workflow' alias is required";
  let workflows: Record<string, string> = {};
  try { workflows = JSON.parse(process.env.PIPEDREAM_WORKFLOWS || "{}"); } catch { /* empty */ }
  const url = workflows[alias];
  if (!url) {
    const known = Object.keys(workflows).join(", ") || "(none configured)";
    return `pipedream error: no workflow registered for alias '${alias}'. Known: ${known}. Add via flyctl secrets: PIPEDREAM_WORKFLOWS='{"${alias}":"https://eoxxx.m.pipedream.net"}'.`;
  }
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.PIPEDREAM_AUTH_TOKEN) headers["Authorization"] = `Bearer ${process.env.PIPEDREAM_AUTH_TOKEN}`;
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(args.payload ?? {}),
      signal: AbortSignal.timeout(30000),
    });
    const ct = r.headers.get("content-type") || "";
    const body = await r.text();
    if (!r.ok) return `pipedream error: ${alias} returned ${r.status}: ${body.slice(0, 250)}`;
    if (ct.includes("application/json")) {
      try {
        const parsed = JSON.parse(body);
        const pretty = JSON.stringify(parsed, null, 2);
        return pretty.length > 1500 ? pretty.slice(0, 1500) + "\n... (truncated)" : pretty;
      } catch { /* fall through */ }
    }
    return body.length > 1500 ? body.slice(0, 1500) + "\n... (truncated)" : body;
  } catch (e) {
    return `pipedream error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// query_calendar_events — reads from existing Google + iCloud merged pipeline.
// ─────────────────────────────────────────────────────────────────────────────
async function toolQueryCalendarEvents(args: { days_ahead?: number; days_back?: number; q?: string }): Promise<string> {
  const daysAhead = args.days_ahead ?? 7;
  const daysBack = args.days_back ?? 0;
  const start = new Date(); start.setDate(start.getDate() - daysBack); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setDate(end.getDate() + daysAhead); end.setHours(23, 59, 59, 999);
  try {
    const [{ listAllCalendarEvents }, { listIcloudEvents }] = await Promise.all([
      import("@/lib/google/calendar"),
      import("@/lib/icloud/calendar"),
    ]);
    const [google, icloud] = await Promise.all([
      listAllCalendarEvents(start.toISOString(), end.toISOString()).catch(() => []),
      listIcloudEvents(start.toISOString(), end.toISOString()).catch(() => []),
    ]);
    type Ev = { title: string; start: string; source: string; location?: string };
    const events: Ev[] = [];
    for (const g of (google as Array<{ summary?: string; start?: { dateTime?: string; date?: string }; location?: string; account_email?: string }>)) {
      const startStr = g.start?.dateTime ?? g.start?.date ?? "";
      events.push({ title: g.summary ?? "(untitled)", start: startStr, source: `google:${g.account_email ?? "?"}`, location: g.location });
    }
    for (const ic of (icloud as Array<{ title?: string; start?: string | Date; location?: string }>)) {
      const startStr = typeof ic.start === "string" ? ic.start : ic.start?.toISOString() ?? "";
      events.push({ title: ic.title ?? "(untitled)", start: startStr, source: "icloud", location: ic.location });
    }
    let filtered = events.filter(e => e.start);
    if (args.q) {
      const q = args.q.toLowerCase();
      filtered = filtered.filter(e => e.title.toLowerCase().includes(q));
    }
    filtered.sort((a, b) => a.start.localeCompare(b.start));
    if (filtered.length === 0) return `No events ${daysBack > 0 ? `from the last ${daysBack}d through ` : "in the next "}${daysAhead} days.`;
    return filtered.slice(0, 30).map(e => {
      const d = new Date(e.start);
      const when = d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" });
      return `• ${when}  ${e.title}${e.location ? ` (${e.location})` : ""}  [${e.source}]`;
    }).join("\n");
  } catch (e) {
    return `query_calendar_events error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// create_calendar_event — Google Calendar via per-account refresh token from
// arthur_email_accounts. Defaults to daniel.may@drinkswithdabney.com per the
// brain rule "Calendar events go to Dabney workspace calendar".
// ─────────────────────────────────────────────────────────────────────────────
async function toolCreateCalendarEvent(args: { title?: string; start?: string; end?: string; description?: string; location?: string; attendees?: string[]; email?: string }): Promise<string> {
  const { title, start, end, description, location, attendees } = args;
  if (!title || !start || !end) return "create_calendar_event error: title, start, end all required (ISO 8601)";
  const email = args.email || "daniel.may@drinkswithdabney.com";
  const { createCalendarEvent } = await import("@/lib/google/calendar");
  const result = await createCalendarEvent({ email, title, start, end, description, location, attendees });
  if ("error" in result) return `create_calendar_event error: ${result.error}`;
  return `Event created on ${email}: "${title}" ${start} → ${end}. ID: ${result.eventId}${result.htmlLink ? ` · ${result.htmlLink}` : ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// send_email — Nylas-grant-aware (canonical mailbox source: arthur_email_accounts).
// Replaces composio_execute(GMAIL_SEND_EMAIL) for Gmail/Yahoo; LOVELEEDAY uses Resend.
// ─────────────────────────────────────────────────────────────────────────────
async function toolSendEmail(args: { entity?: string; to?: string; subject?: string; body?: string; cc?: string; bcc?: string }): Promise<string> {
  const { entity, to, subject, body, cc, bcc } = args;
  if (!entity || !to || !subject || !body) return "send_email error: entity, to, subject, body all required";

  // LOVELEEDAY → Resend (owned domain).
  if (entity === "loveleeday") {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return "send_email error: RESEND_API_KEY not set; cannot send from arthur@loveleedaystudios.com";
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Arthur <arthur@loveleedaystudios.com>",
          to: to.split(",").map(s => s.trim()),
          subject,
          html: body,
          ...(cc ? { cc: cc.split(",").map(s => s.trim()) } : {}),
          ...(bcc ? { bcc: bcc.split(",").map(s => s.trim()) } : {}),
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) return `send_email error: Resend ${r.status}: ${(await r.text()).slice(0, 250)}`;
      const j = await r.json() as { id?: string };
      return `Sent via Resend (arthur@loveleedaystudios.com → ${to}). Message ID: ${j.id ?? "(no id)"}`;
    } catch (e) {
      return `send_email error: Resend ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // Gmail / IMAP via Nylas — resolve grant from canonical arthur_email_accounts table.
  const { resolveMailbox, sendEmailViaNylas } = await import("@/lib/nylas");
  const sb = getSupabaseAdmin();
  const mailbox = await resolveMailbox(entity as Parameters<typeof resolveMailbox>[0], sb);
  if (!mailbox) return `send_email error: no Nylas grant found for entity '${entity}' in arthur_email_accounts`;

  const nylasApiKey = process.env.NYLAS_API_KEY;
  if (!nylasApiKey) return "send_email error: NYLAS_API_KEY not set on this deployment";

  const result = await sendEmailViaNylas({
    grantId: mailbox.grantId,
    to: to.split(",").map(s => s.trim()),
    subject,
    body,
    cc: cc?.split(",").map(s => s.trim()),
    bcc: bcc?.split(",").map(s => s.trim()),
    nylasApiKey,
  });
  if ("error" in result) return `send_email error: ${result.error}`;
  return `Sent via Nylas (${mailbox.email} → ${to}). Message ID: ${result.messageId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// APILayer — unified marketplace gateway. One key, 50+ structured-data APIs.
// Common subscriptions: currency_data, exchangerates_data, mediastack, ip_to_location,
// companies_data, email_verification, number_verification, vat_validation, weatherstack.
// Daniel sets APILAYER_API_KEY in Fly secrets.
// ─────────────────────────────────────────────────────────────────────────────
async function toolAPILayer(args: { api?: string; endpoint?: string; params?: Record<string, unknown> }): Promise<string> {
  const key = process.env.APILAYER_API_KEY;
  if (!key) return "apilayer error: APILAYER_API_KEY not set on this deployment. Add via flyctl secrets.";
  const api = args.api?.trim();
  const endpoint = args.endpoint?.trim();
  if (!api || !endpoint) return "apilayer error: 'api' and 'endpoint' are required";
  try {
    const params = args.params || {};
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const qsStr = qs.toString();
    const url = `https://api.apilayer.com/${api}/${endpoint}${qsStr ? "?" + qsStr : ""}`;
    const r = await fetch(url, {
      method: "GET",
      headers: { "apikey": key },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return `apilayer error: ${api}/${endpoint} returned ${r.status}: ${body.slice(0, 250)}`;
    }
    const data = await r.json();
    // Pretty-cap to 1500 chars so a fat JSON doesn't blow the context window.
    const pretty = JSON.stringify(data, null, 2);
    return pretty.length > 1500 ? pretty.slice(0, 1500) + "\n... (truncated)" : pretty;
  } catch (e) {
    return `apilayer error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context digest — fetched fresh on every turn
// ─────────────────────────────────────────────────────────────────────────────

async function buildContextDigest(): Promise<string> {
  try {
    const db = getSupabaseAdmin();
    const lines: string[] = [];

    // Inbox counts
    const [{ count: unread }, { count: flagged }, { count: total }] = await Promise.all([
      db.from("arthur_inbox_emails").select("*", { count: "exact", head: true }).eq("is_deleted", false).eq("is_read", false).eq("direction", "inbound"),
      db.from("arthur_inbox_emails").select("*", { count: "exact", head: true }).eq("is_deleted", false).eq("label", "flagged"),
      db.from("arthur_inbox_emails").select("*", { count: "exact", head: true }).eq("is_deleted", false).eq("direction", "inbound"),
    ]);
    lines.push(`Inbox: ${unread ?? 0} unread inbound, ${flagged ?? 0} flagged, ${total ?? 0} total inbound`);

    // Legal vault
    const { data: legalEntities } = await db.from("legal_documents").select("entity").eq("is_archived", false);
    const entityCount = new Set((legalEntities ?? []).map((r: Record<string, unknown>) => r.entity)).size;
    lines.push(`Legal vault: ${legalEntities?.length ?? 0} docs across ${entityCount} entities`);

    // Recent inbox classifications
    const { data: recentCls } = await db
      .from("arthur_inbox_emails")
      .select("subject,classification,received_at")
      .not("classification", "is", null)
      .order("received_at", { ascending: false })
      .limit(5);
    if (recentCls && recentCls.length > 0) {
      const clsSummary = (recentCls as Array<{ subject: string; classification: Record<string, unknown>; received_at: string }>)
        .map(e => `${(e.subject ?? "(no subject)").slice(0, 40)} [${e.classification?.intent ?? "?"}]`)
        .join(", ");
      lines.push(`Recent classified emails: ${clsSummary}`);
    }

    // Memory index count
    const { count: memCount } = await db.from("arthur_memory_index").select("*", { count: "exact", head: true });
    lines.push(`Memory index: ${memCount ?? 0} entries`);

    return lines.join("\n");
  } catch {
    return "Context digest unavailable";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase conversation persistence
// ─────────────────────────────────────────────────────────────────────────────

async function loadHistory(sessionId: string, limit = 20): Promise<ConvRow[]> {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("arthur_dashboard_conversations")
      .select("role,content,tool_calls,tool_results")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as ConvRow[]).reverse();
  } catch { return []; }
}

async function persistMessage(sessionId: string, role: string, content: string, extra: {
  tool_calls?: unknown; tool_results?: unknown; metadata?: unknown;
} = {}) {
  try {
    const db = getSupabaseAdmin();
    await db.from("arthur_dashboard_conversations").insert({
      session_id: sessionId,
      role,
      content: content.slice(0, 16000),
      tool_calls: extra.tool_calls ?? null,
      tool_results: extra.tool_results ?? null,
      metadata: extra.metadata ?? {},
    });
  } catch { /* non-fatal */ }
}


/**
 * Heuristic — does this prompt likely need a tool call? If yes, route through
 * tool-capable Tier 11+ (Anthropic Haiku is cheapest tool-capable in chain).
 * If no, route through cheap Tier 5/6 (Groq/Cerebras) first; escalate to Haiku
 * only if those fail. Mirrors the 18-tier router logic — chat-only providers
 * for chat-only intents, tool-capable providers for tool intents.
 */
function promptNeedsTools(messages: OpenAIMessage[]): boolean {
  const lastUser = [...messages].reverse().find(m => m.role === "user");
  const text = (typeof lastUser?.content === "string" ? lastUser.content : "").toLowerCase();
  if (!text) return true; // be safe — default to tool-capable
  // Pure-conversational allowlist — these prompts NEVER need tools.
  // Anything not on this list AND that mentions external/factual reality routes to tools.
  const conversationalOnly = [
    /^(hi|hey|hello|yo|sup|good morning|good afternoon|good evening|gm)\b/,
    /^(thanks|ty|thank you|thx|appreciate it|cool|nice|got it|ok|okay|sounds good)\b/,
    /^(who are you|what are you|describe yourself|what model|tell me about yourself)/,
    /^(can you|could you)\s+(help|explain|tell me|describe)\s+(?!.*\b(today|now|current|latest|live|score|price|news|weather|inbox|email|calendar|memory|website|status)\b)/,
  ];
  if (conversationalOnly.some(re => re.test(text))) return false;

  const toolKeywords = [
    "inbox", "email", "thread", "from ", "received", "draft", "reply to", "send to",
    "legal", "contract", "lease", "license", "agreement", "permit",
    "memory", "remember", "recall", "what do you know about", "what did i decide", "what did we decide",
    "weather", "temperature", "forecast", "rain", "snow", "humid", "wind",
    "graph", "brain index", "knowledge graph",
    "what have you done", "recent activity", "what did you do",
    "audit", "look up", "fetch", "pull up", "show me", "find me", "get me",
    "calendar", "event", "invite", "meeting", "schedule",
    // Web-search-bait — questions where stale training data lies
    "who is", "who's", "what is the president", "current price", "stock price", "stock", "shares",
    "today's", "this week", "this month", "this year", "latest", "news", "headlines",
    "score", "winner", "who won", "election",
    // Service/website status checks — Cerebras was leaking these
    "is the", "are the", "is dabney", "is olldae", "website up", "website down", "site up", "site down",
    "is up", "is down", "online", "offline", "is it live", "is it open",
    " status", " uptime",
    // Time-sensitive
    "right now", " now ", " today", "tomorrow", "yesterday", "tonight", "this morning", "this evening",
    " happening", "going on",
    // Action verbs (data lookup intent)
    "check", "verify", "confirm", "search", "google",
    // Money / finance
    "p&l", "revenue", "profit", "balance", "invoice", "vendor", "expense",
    // Currency / FX / APILayer
    "convert", "exchange rate", "fx ", "usd", "eur", "gbp", "cad", "yen", "currency",
    // Daniel's project-specific decision/state lookup — must hit memory
    "what did i decide", "what did we decide", "pricing for", "what's the plan for",
    "what's my", "what is my", "decision on", "status of",
    " olldae", " kronos", " dabney", " loveleeday", " aspen", " arthur",
    // TV / streaming / showtimes — always needs web_search
    "what time does", "what time is", "what channel", "tv schedule", "showtimes", "comes on", "come on",
    "season", "episode", "premiere", "finale", "airs", "streaming on", "watch on",
    "real housewives", "love island", "the bachelor", "saturday night live", "snl",
    "price of gas", "gas price", "open near me", "near me", "hours for", "open today",
    "what's open", "restaurants", "drive-thru", "pharmacy", "store hours",
    "validate", "verify the", "check email", "scrape", "crawl", "screenshot of",
    "create event", "schedule meeting", "create task", "post to slack", "create notion",
    "send slack", "create issue", "github issue", "linear issue", "hubspot",
    "stripe", "charge", "refund", "create invoice", "draft email", "write email",
    "cavs", "cavaliers", "lions", "tigers", "red wings", "pistons", "spurs",
    "broncos", "chiefs", "bengals", "lakers", "warriors", "celtics", "heat",
    "patriots", "steelers", "cowboys", "yankees", "dodgers", "blackhawks",
    "xero", "p&l", "balance sheet", "accounts payable", "accounts receivable", "cash flow",
    "burn rate", "runway", "monthly recurring", "mrr",
  ];
  return toolKeywords.some(kw => text.includes(kw));
}

async function callLLM(messages: OpenAIMessage[], withTools: boolean): Promise<{ response: LLMResponse; provider: string } | null> {
  // Delegates to lib/router.ts which walks the canonical 18-tier ladder with
  // tool-capable filter. This file no longer hardcodes the chain — adding a new
  // tier is a one-place edit in lib/router.ts TIERS.
  const { routeToLLM, TIERS: _TIERS } = await import("@/lib/router");
  void _TIERS; // referenced for type clarity
  const requiresTools = withTools && promptNeedsTools(messages);
  const result = await routeToLLM(messages as Parameters<typeof routeToLLM>[0], {
    requiresTools,
    toolDefs: requiresTools ? (TOOL_DEFINITIONS as Parameters<typeof routeToLLM>[1]["toolDefs"]) : [],
  });
  if (!result) return null;
  return {
    response: result.response,
    // Internal telemetry only — UI no longer renders this. Format kept for logs.
    provider: `${result.tier.id}-T${result.tier.tier}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const deny = authGate(req, { allowReadFromBrowser: false });
  if (deny) return deny;

  // Rate limit chat: 30 requests/min to protect Anthropic API quota
  const rl = await rateLimit("chat", 30, 60);
  if (rl) return rl;

  let payload: unknown;
  try { payload = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Two input modes:
  // - Backplane mode: caller passes `messages: [{role,content}, …]` AND
  //   `surface: 'telegram' | 'cli' | …`. We use those messages directly,
  //   skip server-side history load, and skip dashboard-table persistence.
  //   The surface owns its own conversation log. This is how Telegram + cli
  //   share the chat brain without duplicating history.
  // - Prompt mode (legacy/dashboard): caller passes `prompt` + `session_id`.
  //   We load history from arthur_dashboard_conversations, persist user +
  //   assistant turns there. Default behavior for the dashboard chat UI.
  const { prompt, session_id: clientSessionId, messages: clientMessages, surface } =
    (payload || {}) as {
      prompt?: string;
      session_id?: string;
      messages?: Array<{ role: string; content: string }>;
      surface?: string;
    };

  const isBackplaneMode = Array.isArray(clientMessages) && clientMessages.length > 0;
  if (!isBackplaneMode && (!prompt || typeof prompt !== "string" || !prompt.trim())) {
    return NextResponse.json({ error: "prompt or messages required" }, { status: 400 });
  }

  const sessionId = (clientSessionId && typeof clientSessionId === "string" && clientSessionId.trim())
    ? clientSessionId.trim()
    : (surface ? `${surface}-${randomUUID().slice(0, 8)}` : randomUUID());

  // 1. Fetch context digest. In prompt mode also load server-side history.
  // In backplane mode, the caller provides the full message array — skip
  // history load to avoid duplicating context the surface already supplied.
  const [contextDigest, history] = await Promise.all([
    buildContextDigest(),
    isBackplaneMode ? Promise.resolve([] as Awaited<ReturnType<typeof loadHistory>>) : loadHistory(sessionId, 20),
  ]);

  // 1b. Resolve user's current location from their IP (cached 1h)
  // Canonical user-location: read from arthur_user_location row (Mac cron upserts every 5min).
  // Fall back to request-IP geo if the table is stale (>30min old) or missing.
  let currentLocation: string | null = null;
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb
      .from("arthur_user_location")
      .select("city, region, updated_at")
      .eq("id", "daniel")
      .single();
    if (data?.city) {
      const ageMin = (Date.now() - new Date(data.updated_at as string).getTime()) / 60000;
      if (ageMin < 30) {
        currentLocation = `${data.city}${data.region ? ", " + data.region : ""}`;
      }
    }
  } catch { /* table read non-critical */ }
  if (!currentLocation) {
    const userIp = req.headers.get("fly-client-ip")
      || req.headers.get("cf-connecting-ip")
      || req.headers.get("x-client-ip")
      || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || "";
    const geo = userIp ? await inferLocationFromIP(userIp) : null;
    currentLocation = geo ? `${geo.city}${geo.region ? ", " + geo.region : ""}` : null;
  }

  // 2. Build messages array
  // In prompt mode: system + loaded history + new user prompt.
  // In backplane mode: system (rebuilt fresh) + caller-provided messages
  //   (with any caller-supplied system stripped — we own the system prompt).
  const lastUserText = isBackplaneMode
    ? (clientMessages!.filter(m => m.role === "user").slice(-1)[0]?.content ?? "")
    : prompt!;
  const turnRequiresTools = promptNeedsTools([{ role: "user", content: lastUserText }]);
  const systemPrompt = buildSystemPrompt(contextDigest, currentLocation, turnRequiresTools);
  const messages: OpenAIMessage[] = isBackplaneMode
    ? [
        { role: "system", content: systemPrompt },
        ...clientMessages!
          .filter(m => m.role !== "system")
          .map((m): OpenAIMessage => ({
            role: m.role as OpenAIMessage["role"],
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          })),
      ]
    : [
        { role: "system", content: systemPrompt },
        ...history.map((h): OpenAIMessage => {
          if (h.role === "tool") {
            return { role: "assistant", content: h.content };
          }
          return {
            role: h.role as OpenAIMessage["role"],
            content: h.content,
            ...(h.tool_calls ? { tool_calls: h.tool_calls as OpenAIToolCall[] } : {}),
          };
        }),
        { role: "user", content: prompt!.slice(0, 8000) },
      ];

  // 3. Persist user message — only in prompt mode. Backplane callers (Telegram,
  // cli) own their own conversation history table and pass full context per turn.
  if (!isBackplaneMode) {
    await persistMessage(sessionId, "user", prompt!);
  }

  // 3b. Implicit-correction detector — fire before LLM, never blocks chat path.
  // Skipped in backplane mode (the surface owns history; this detector reads
  // server-side history that doesn't exist in that mode).
  if (!isBackplaneMode) {
    try {
      const { maybeRecordImplicitCorrection } = await import("@/lib/training/implicit-correction-detector");
      await maybeRecordImplicitCorrection({ sessionId, userTurn: prompt! });
    } catch { /* non-fatal */ }
  }

  // 4. Tool-call loop (max 4 rounds)
  const MAX_ROUNDS = 4;
  let finalContent = "";
  let finalProvider = "";
  const allToolCalls: OpenAIToolCall[] = [];
  const allToolResults: Array<{ name: string; result: string }> = [];
  let roundMessages = [...messages];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const withTools = round < MAX_ROUNDS - 1; // last round: no tools to force text output
    const result = await callLLM(roundMessages, withTools);

    if (!result) {
      finalContent = "All providers failed (Pioneer, Groq, Cerebras all down or unconfigured). Try again in a few minutes.";
      break;
    }

    finalProvider = result.provider;
    const choice = result.response.choices?.[0];
    const assistantMsg = choice?.message;

    if (!assistantMsg) {
      finalContent = "Empty response from LLM. Try again.";
      break;
    }

    const toolCalls = assistantMsg.tool_calls ?? [];

    // No tool calls → final answer
    if (toolCalls.length === 0) {
      finalContent = assistantMsg.content ?? "(no content)";
      roundMessages.push({ role: "assistant", content: finalContent });
      break;
    }

    // Add assistant turn with tool_calls to thread
    roundMessages.push({
      role: "assistant",
      content: assistantMsg.content ?? null,
      tool_calls: toolCalls,
    });
    allToolCalls.push(...toolCalls);

    // Execute each tool call
    const toolResultMessages: OpenAIMessage[] = [];
    for (const tc of toolCalls) {
      const fnName = tc.function?.name ?? "unknown";
      const fnArgs = tc.function?.arguments ?? "{}";
      console.log(`[chat/tool] round=${round} tool=${fnName} args=${fnArgs.slice(0, 120)}`);
      const toolResult = await executeTool(fnName, fnArgs);
      allToolResults.push({ name: fnName, result: toolResult });
      toolResultMessages.push({
        role: "tool",
        content: toolResult,
        tool_call_id: tc.id,
        name: fnName,
      });
    }

    // Append tool results to thread
    roundMessages.push(...toolResultMessages);

    // Persist tool round to dashboard table — only in prompt mode.
    if (!isBackplaneMode) {
      await persistMessage(sessionId, "tool",
        toolCalls.map(tc => `[${tc.function?.name}] ${tc.function?.arguments?.slice(0, 80)}`).join("\n"),
        {
          tool_calls: toolCalls,
          tool_results: allToolResults.slice(-toolCalls.length),
        }
      );
    }

    // If last round and still in tool loop, synthesize from tool results
    if (round === MAX_ROUNDS - 1) {
      finalContent = allToolResults.map(r => `**${r.name}**:\n${r.result}`).join("\n\n");
    }
  }

  // 4b. Anti-leak post-process — strip text-as-tool-call leaks and "I'm waiting on async results"
  // hallucinations that some models still emit despite the prompt instructions.
  finalContent = sanitizeAssistantText(finalContent, allToolCalls.length);

  // 5. Persist assistant response — only in prompt mode (the surface owns
  // history in backplane mode).
  if (!isBackplaneMode) {
    await persistMessage(sessionId, "assistant", finalContent, {
      metadata: { provider: finalProvider, tool_calls_count: allToolCalls.length },
    });
  }

  // 5b. Record employee dispatch — runs in BOTH modes so the learning loop
  // sees telegram + cli traffic too. inferEmployee uses the last user turn.
  try {
    const { recordDispatch, inferEmployee } = await import("@/lib/employees/recorder");
    const emp = inferEmployee(lastUserText || "");
    await recordDispatch({
      team: emp.team,
      employee_id: emp.employee_id,
      task: lastUserText || "(empty)",
      model_used: finalProvider || "unknown",
      state: "active",
      metadata: { tool_calls: allToolCalls.length, session_id: sessionId, surface: surface || "dashboard" },
    });
  } catch { /* recorder is non-critical */ }

  // 6. Return — preserving { response, model, routing } shape the UI expects + new fields
  return NextResponse.json({
    response: finalContent,
    session_id: sessionId,
    model: finalProvider || "unknown",
    model_used: finalProvider || "unknown",
    tier_used: tierForProvider(finalProvider || ""),
    routing: {
      model: finalProvider || "unknown",
      cost: finalProvider.startsWith("pioneer") ? 0 : finalProvider.startsWith("groq") ? 0.0003 : 0,
      reason: finalProvider.startsWith("pioneer") ? "default chat" : `fallback to ${finalProvider.split("/")[0]}`,
      fallbacks_used: 0,
      tool_calls_used: allToolCalls.length,
    },
    tool_calls_used: allToolCalls.length,
  });
}

// Strip text-as-tool-call leaks and async-pretend hallucinations from a
// just-generated assistant turn. Models occasionally emit `[web_search] {...}`
// as plain text or claim they're "waiting for results" when turns are sync.
function sanitizeAssistantText(s: string, toolsActuallyUsed: number): string {
  if (!s) return s;
  let out = s;

  // ALL 19 tool names — keep this list in sync with TOOL_DEFINITIONS.
  const ALL_TOOL_RE = "web_search|live_sports_score|get_weather|query_inbox|query_legal|query_brain_graph|query_memory|list_recent_actions|send_email|create_calendar_event|query_calendar_events|composio_execute|pipedream_workflow|scrape_url|validate_email|convert_currency|apilayer|browserbase_search|browserbase_fetch";

  // Pattern 1: `[tool_name] {json}` or `[tool_name](json)` — strip the line.
  out = out.replace(new RegExp(`^\\s*\\[(?:${ALL_TOOL_RE})\\]\\s*[{(\\[][^\\n]*[})\\]]\\s*$`, "gim"), "");

  // Pattern 2: bare tool-call syntax mid-text — `web_search('foo')` etc.
  out = out.replace(new RegExp(`\\b(?:${ALL_TOOL_RE})\\s*\\(['"][^'"]*['"]\\)`, "g"), "");

  // Pattern 3: italicized action text — narrowed to tool-mimicking only (don't strip
  // legitimate Arthur voice like "*Checking the inbox for Daniel's recent emails*").
  // Only fires when the verb is followed by an actual tool name OR a generic
  // "the X tool" phrasing.
  out = out.replace(new RegExp(`\\*+\\s*(?:performs?|calling|invoking|running|fetching)\\s+(?:${ALL_TOOL_RE}|the\\s+\\w+\\s+tool)[^*\\n]*\\*+`, "gi"), "");

  // Pattern 4: "Let me check tool_name..." / "Let me run tool_name..."
  out = out.replace(new RegExp(`^.*\\b(?:Let me|I'?ll|I will)\\s+(?:check|run|invoke|call|use)\\s+(?:${ALL_TOOL_RE}|the\\s+\\w+\\s+tool)\\b[^\\n]*\\n?`, "gmi"), "");

  // Pattern 5: async-pretend — model claims it's "waiting for results to come back".
  // These are dishonest because the turn is synchronous; either tools were called or not.
  if (toolsActuallyUsed === 0) {
    out = out.replace(/^.*\b(?:I(?:'?m| am)?\s+(?:waiting|need to wait|still waiting)\s+(?:on|for)\s+(?:the\s+)?(?:web\s*search|search|tool)\s+(?:result|call|response)|once\s+(?:that|it|the search|the result)\s+comes? back|i'?ll\s+(?:detail|get back to you)\s+(?:once|when)\s+(?:that|the|it)\s+(?:returns|comes back|finishes))\b[^\n]*\n?/gmi, "");
  }

  // Pattern 6: trailing "Want me to ___?" / "Should I ___?" offers — strip the
  // last sentence/paragraph if it's just a permission ask. Persona rule says
  // never ask permission, but Haiku still tacks them on as closing offers.
  // Only strips at end-of-message; mid-message permission asks (rare) stay.
  out = out.replace(/(?:\n+|\s+)?(?:Want me to|Should I|Would you like me to|Do you want me to)\s+[^?]*\?\s*$/i, "");
  out = out.replace(/(?:\n+|\s+)?(?:Let me know if you'?d like me to|Just say the word and I'?ll)\s+[^.!?]*[.!?]?\s*$/i, "");

  // Pattern 7: strip markdown asterisk emphasis (`**bold**`, `*italic*`) — they
  // render literally in most chat surfaces and read robotic. Preserve content,
  // drop the markers. Don't touch code-fence backticks or list bullets.
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, "$1");           // **bold** → bold
  out = out.replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, "$1");  // *italic* → italic (avoid 5*5)
  out = out.replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "$1");    // _underline_ → underline

  // Collapse multiple blank lines from removals.
  out = out.replace(/\n{3,}/g, "\n\n").trim();

  // If sanitization gutted the response entirely AND tools weren't called,
  // surface an honest failure rather than an empty bubble.
  if (!out && toolsActuallyUsed === 0) {
    return "I tried to answer that but ended up writing the tool call as text instead of invoking it. Ask again — I'll route through the tool properly this time.";
  }
  return out;
}

// Coarse tier label — canonical 18-tier ladder from CLAUDE.md / model-router.js.
// T0=Script T1=GLiNER T2=MSA T3=Gemma T4=Arthur-tuned T5=Groq T6=Cerebras T7=Pioneer
// T8=DeepSeek-Chat T9=DeepSeek-R1 T10=Perplexity T11=Haiku T12=Gemini T13=Kimi
// T14=Sonnet T15=o4 T16=Code T17=Opus
function tierForProvider(p: string): string {
  if (!p) return "T?";
  const s = p.toLowerCase();
  if (s.includes("gliner")) return "T1";
  if (s.includes("msa")) return "T2";
  if (s.includes("gemma")) return "T3";
  if (s.includes("arthur-tuned") || s.includes("arthur-7b") || s.includes("qwen")) return "T4";
  if (s.includes("groq") || s.includes("llama-3.3") || s.includes("llama-3.1")) return "T5";
  if (s.includes("cerebras") || s.includes("qwen-3-235")) return "T6";
  if (s.includes("pioneer") || s.includes("fastino")) return "T7";
  if (s.includes("deepseek-chat")) return "T8";
  if (s.includes("deepseek-r1") || s.includes("deepseek-reasoner")) return "T9";
  if (s.includes("perplexity") || s.includes("sonar")) return "T10";
  if (s.includes("haiku")) return "T11";
  if (s.includes("gemini")) return "T12";
  if (s.includes("kimi") || s.includes("moonshot")) return "T13";
  if (s.includes("sonnet")) return "T14";
  if (s.includes("o4") || s.includes("gpt-4o") || s.includes("gpt-5")) return "T15";
  if (s.includes("claude-code")) return "T16";
  if (s.includes("opus")) return "T17";
  return "T?";
}
