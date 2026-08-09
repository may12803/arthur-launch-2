import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate, rateLimit } from "@/lib/_auth";
import { buildPersona } from "@/lib/persona/arthur-system-prompt";
import { sanitizeArthurReply } from "@/lib/sanitizer";
import { streamChat } from "@/lib/router-stream";
import { fetchLivePersona as livePullerFetch } from "@/lib/persona/live-puller";

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

// IP geolocation cache (prevents hammering ipapi on every request).
// `city: null` is a NEGATIVE entry — a lookup that failed. Only successes used to
// be cached, so once ipapi started returning 429 (measured 2026-08-09: 429 on
// every call, ~400ms each) every chat turn re-hit it and paid that latency
// forever for a result that could never arrive. Negative entries are cached on a
// shorter TTL so a recovered/reset quota is picked up within the hour.
const _ipGeoCache = new Map<string, { city: string | null; region: string; ts: number }>();
const GEO_TTL_OK_MS = 3600 * 1000;   // 1h for a good answer
const GEO_TTL_FAIL_MS = 600 * 1000;  // 10min before retrying a failure

async function inferLocationFromIP(ip: string): Promise<{ city: string; region: string } | null> {
  if (!ip || ip === "127.0.0.1" || ip.startsWith("::1")) return null;
  const cached = _ipGeoCache.get(ip);
  if (cached) {
    const ttl = cached.city ? GEO_TTL_OK_MS : GEO_TTL_FAIL_MS;
    if (Date.now() - cached.ts < ttl) {
      return cached.city ? { city: cached.city, region: cached.region } : null;
    }
  }
  const miss = (): null => {
    _ipGeoCache.set(ip, { city: null, region: "", ts: Date.now() });
    return null;
  };
  try {
    const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return miss();
    const j = await r.json() as { city?: string; region?: string; region_code?: string; error?: boolean };
    if (j.error || !j.city) return miss();
    const region = j.region_code || j.region || "";
    _ipGeoCache.set(ip, { city: j.city, region, ts: Date.now() });
    return { city: j.city, region };
  } catch { return miss(); }
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
      ? ["query_inbox", "send_email", "query_calendar_events", "create_calendar_event", "query_legal", "query_brain_graph", "query_memory", "list_recent_actions", "get_cash_balance", "get_weather", "web_search", "live_sports_score", "scrape_url", "validate_email", "convert_currency", "apilayer", "composio_execute", "pipedream_workflow", "propose_project_concepts", "build_new_project", "audit_and_rebuild_site", "get_build_status"]
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

TOOLS AVAILABLE: query_inbox, query_legal, query_brain_graph, query_memory, list_recent_actions, get_weather, web_search, live_sports_score.

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
      name: "get_cash_balance",
      description: "Get Daniel's LIVE bank balances (Dabney Chase accounts) via Stripe Financial Connections with force-refresh. Use for ANY question about cash balance, bank balance, how much money, account balance, runway. NEVER answer balance questions from memory or tell Daniel to check Xero — call this.",
      parameters: { type: "object", properties: {} },
    },
  },
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
      name: "MemorySearch",
      description: "SEMANTIC vector search across ALL of Arthur's banked knowledge — 34 design mastery files (typography, motion, dark-mode, color, accessibility, awwwards-patterns, refactoring-ui), ~700 brain files, learned patterns, feedback rules. Returns the most semantically similar chunks by cosine similarity (NOT keyword match — use this, not query_memory, for 'how should this look', design intent, 'what did I learn about X', 'what's the rule for Y'). REQUIRED before any UI/UX/visual output per persona design directive.",
      parameters: {
        type: "object",
        properties: {
          query:     { type: "string", description: "Natural-language search query (e.g. 'dark-mode dashboard typography scale')." },
          top_k:     { type: "number", description: "Max results (default 6)." },
          threshold: { type: "number", description: "Cosine-similarity floor 0–1 (default 0.3)." },
        },
        required: ["query"],
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
      description: "Search the live web for current/factual information OUTSIDE Daniel's personal data. Use for: world news, politics, sports, public figures, market prices, company info, anything you would otherwise answer from training data (which is stale). DO NOT use query_brain_graph for these — that's Daniel's notes only. Returns a synthesized answer with citations.",
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
      name: "search_flights",
      description: "Search live flight offers via Duffel — returns up to 5 cheapest fares with carrier, total price, slice details, and stops. Use whenever Daniel asks 'find flights from X to Y on date Z'. Phase 1 research-only — Arthur returns offers, Daniel books manually. Auto-resolves common city names (Grand Rapids, Chicago, NYC, etc.) to IATA codes; otherwise pass 3-letter IATA. Date format: YYYY-MM-DD.",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Origin: IATA code (GRR, ORD) OR city name (Grand Rapids, Chicago)." },
          destination: { type: "string", description: "Destination: IATA code or city name." },
          depart_date: { type: "string", description: "Departure date YYYY-MM-DD" },
          return_date: { type: "string", description: "Return date YYYY-MM-DD (omit for one-way)" },
          passengers: { type: "number", description: "Number of adult passengers (default 1)" },
          cabin: { type: "string", enum: ["economy", "premium_economy", "business", "first"], description: "Cabin class — default economy" },
          max_connections: { type: "number", description: "Max connections per slice (default 1)" },
        },
        required: ["origin", "destination", "depart_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_hotels",
      description: "Search live hotel offers via Duffel Stays — returns up to 8 hotels with specific per-night + total price, address, rating, cancellation policy, and a clickable booking URL. Use whenever Daniel asks 'find me a hotel in X for date Y', 'book a place in Z', or any lodging search. ALWAYS surface specific total price (not a range), and include the clickable URL inline. After offers, ask Daniel which one to book + offer Stripe Link payment OR Klarna sign-off.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City name (Savannah, New Orleans), neighborhood ('downtown New Orleans'), or 'lat,lng'." },
          check_in: { type: "string", description: "Check-in date YYYY-MM-DD" },
          check_out: { type: "string", description: "Check-out date YYYY-MM-DD" },
          guests: { type: "number", description: "Number of adult guests (default 2)" },
          rooms: { type: "number", description: "Number of rooms (default 1)" },
          max_price_per_night_usd: { type: "number", description: "Optional ceiling — drops offers above this per-night price" },
        },
        required: ["location", "check_in", "check_out"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_project_concepts",
      description: "When Daniel describes a vague project idea (\"build me software for X\", \"I want a SaaS for Y\", \"redesign drinkswithdabney.com\"), use this BEFORE build_new_project. Generates 3-5 distinct named concept directions (each with name, tagline, positioning, brand vibe, hero archetype suggestion) AND 3-5 follow-up questions to narrow the scope. ALWAYS use this first when a brief is non-trivially ambiguous; only skip when Daniel has already provided a fully-specified brief (slug + description + category + audience + concrete positioning).",
      parameters: {
        type: "object",
        properties: {
          rough_brief: { type: "string", description: "Daniel's raw brief verbatim — e.g. 'software for restaurant reservations' or 'something for indie game devs'" },
          known_constraints: { type: "string", description: "Any constraints already mentioned (audience, region, pricing model, existing brand) — empty string if none" },
        },
        required: ["rough_brief"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_new_project",
      description: "Kicks off a full-pipeline build for a concrete project brief. Returns a build_id immediately and runs the build asynchronously in the background (~25 min total). Use this AFTER propose_project_concepts when Daniel has picked a concept, OR directly when the brief is fully-specified (slug + description + category + audience). Spawns arthur-build and writes events to ~/.arthur/builds/<id>/events.jsonl. Daniel can ask 'how is the build going' later (use get_build_status) and the deploy URL will auto-open in the browser when the build completes.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "kebab-case-lower project identifier — e.g. 'embers' or 'plate-table'" },
          name: { type: "string", description: "Display name — defaults to capitalized slug" },
          description: { type: "string", description: "One-paragraph project description that will drive the entire pipeline. Be specific about audience, value prop, key features. This is the primary input the build pipeline reads." },
          domain: { type: "string", description: "Domain name (e.g. embers.coffee). Defaults to <slug>.com." },
          category: { type: "string", enum: ["SaaS", "marketplace", "content", "fintech", "devtool", "consumer", "services", "ecommerce"], description: "Project category — used by stage 0.45 design DNA picker" },
          audience: { type: "string", description: "Primary audience description — e.g. 'solo + small-firm attorneys' or 'home cooks who watch Bon Appétit'" },
          tier: { type: "string", enum: ["500", "1000", "2000"], description: "Build tier (cost cap) — 500 default, 2000 for white-glove" },
          budget_cap_usd: { type: "number", description: "Max LLM spend for this build in USD (default 5)" },
        },
        required: ["slug", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "audit_and_rebuild_site",
      description: "Kicks off the audit-and-rebuild pipeline against an existing live site (e.g. 'review and rebuild arthur-online.fly.dev', 'redesign drinkswithdabney.com'). Returns a job_id immediately and runs phases 1-4 asynchronously (audit via Playwright + multi-persona Sonnet review → mockup gate → rebuild → deploy). Skeleton-only as of 2026-05-09 — the entry point runs but full pipeline is multi-day. Use this for redesign requests on existing sites; use build_new_project for greenfield.",
      parameters: {
        type: "object",
        properties: {
          target_url: { type: "string", description: "Live site URL to audit + rebuild (e.g. https://arthur-online.fly.dev)" },
          routes: { type: "string", description: "Optional comma-separated route list to focus on (e.g. '/,/pricing,/about'). Omit to auto-discover via sitemap." },
          phase: { type: "string", enum: ["1", "2", "3", "4", "all"], description: "Run a specific phase only (1=audit, 2=mockup, 3=rebuild, 4=deploy) or all phases. Default 'all'." },
        },
        required: ["target_url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_build_status",
      description: "Read the live status of a running or completed build (kicked off via build_new_project or audit_and_rebuild_site). Returns current stage, total cost, completed stage count, deploy URL if ready, last failure reason if failed. Use when Daniel asks 'how is the build', 'is X deployed yet', 'what stage is the embers build on'.",
      parameters: {
        type: "object",
        properties: {
          build_id: { type: "string", description: "The build_id returned by build_new_project. Omit to get the most-recent build status." },
        },
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tool implementations
// ─────────────────────────────────────────────────────────────────────────────

async function toolGetCashBalance(): Promise<string> {
  const key = process.env.STRIPE_DABNEY_SECRET_KEY;
  if (!key) return "Cash-balance tool is wired but STRIPE_DABNEY_SECRET_KEY is not set on this deployment — tell Daniel one command fixes it: flyctl secrets set STRIPE_DABNEY_SECRET_KEY=<key> -a arthur-online";
  const auth = "Basic " + Buffer.from(key + ":").toString("base64");
  const sFetch = (p: string, init?: RequestInit) =>
    fetch(`https://api.stripe.com/v1/${p}`, { ...init, headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded", ...(init?.headers || {}) }, signal: AbortSignal.timeout(20000) });
  try {
    const list = await (await sFetch("financial_connections/accounts?limit=10")).json();
    const accounts = (list.data || []).filter((a: { status: string }) => a.status === "active");
    if (!accounts.length) return "No active Financial Connections accounts found on the Dabney Stripe account.";
    const lines: string[] = [];
    for (const a of accounts) {
      // Force a balance refresh — GET alone returns Stripe's stale cache
      // (the frozen-balance bug class from 2026-06-03).
      await sFetch(`financial_connections/accounts/${a.id}/refresh`, { method: "POST", body: "features[]=balance" }).catch(() => null);
      await new Promise((r) => setTimeout(r, 3000));
      const acct = await (await sFetch(`financial_connections/accounts/${a.id}`)).json();
      const bal = acct.balance?.cash?.available?.usd ?? acct.balance?.current?.usd;
      const asOf = acct.balance?.as_of ? new Date(acct.balance.as_of * 1000).toISOString().slice(0, 16) + "Z" : "unknown";
      const fresh = acct.balance_refresh?.status === "succeeded" ? "refreshed" : `refresh ${acct.balance_refresh?.status || "n/a"} (may lag)`;
      const kind = acct.subcategory === "credit_card" ? "credit card — balance owed" : (acct.subcategory || "account");
      lines.push(`${acct.institution_name || "Bank"} ****${acct.last4} (${kind}): $${bal != null ? (bal / 100).toFixed(2) : "?"} (as of ${asOf}, ${fresh})`);
    }
    return lines.join("\n");
  } catch (e) {
    return `Cash-balance lookup failed: ${e instanceof Error ? e.message : String(e)}. Daniel can run ~/arthur/scripts/dabney-bank-current.js locally as fallback.`;
  }
}

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

// MemorySearch — SEMANTIC vector search over pgvector (match_arthur_memories),
// the same store the TUI + Telegram use. Embeds the query with OpenAI
// text-embedding-3-small (1536 dim, matches the index), then cosine-matches.
// This is how design knowledge (source='knowledge-design') + all brain files
// become reachable from the dashboard. query_memory above is keyword-only.
async function toolMemorySearch(args: { query?: string; top_k?: number; threshold?: number }): Promise<string> {
  const query = args.query?.trim();
  if (!query) return "MemorySearch error: query required";
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return "MemorySearch error: OPENAI_API_KEY not configured";
    const embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
    });
    if (!embRes.ok) return `MemorySearch error: embed ${embRes.status}: ${(await embRes.text()).slice(0, 150)}`;
    const embJson = await embRes.json();
    const queryEmbedding = embJson?.data?.[0]?.embedding;
    if (!queryEmbedding) return "MemorySearch error: no embedding returned";
    const db = getSupabaseAdmin();
    const { data, error } = await db.rpc("match_arthur_memories", {
      query_embedding: queryEmbedding,
      match_threshold: args.threshold ?? 0.3,
      match_count: args.top_k ?? 6,
    });
    if (error) return `MemorySearch error: ${error.message}`;
    if (!data || data.length === 0) return `No memory matches "${query}".`;
    const lines: string[] = [`MemorySearch: ${data.length} semantic matches for "${query}".\n`];
    for (const r of data as Array<{ source?: string; content?: string; similarity?: number }>) {
      const sim = typeof r.similarity === "number" ? r.similarity.toFixed(3) : "?";
      lines.push(`[sim ${sim}] ${r.source ?? "memory"}\n${(r.content ?? "").slice(0, 400)}\n`);
    }
    return lines.join("\n");
  } catch (e: unknown) {
    return `MemorySearch error: ${e instanceof Error ? e.message : String(e)}`;
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
// Build pipeline tools — propose, build, audit, status
// ─────────────────────────────────────────────────────────────────────────────

async function toolProposeProjectConcepts(args: { rough_brief?: string; known_constraints?: string }): Promise<string> {
  const brief = (args.rough_brief || '').trim();
  if (!brief) return "propose_project_concepts: rough_brief is required";
  const constraints = (args.known_constraints || '').trim();
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  // Lazy-load the domain checker (lives in ~/arthur, not in arthur-launch's node_modules)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = await import('node:path');
  const os = await import('node:os');
  const domainModulePath = path.join(os.homedir(), 'arthur/lib/domain-availability.js');
  let checkDomains: any, summarize: any, brandCollisionCheck: any;
  try {
    // eval('require') bypasses Turbopack's static analyzer. The module lives
    // OUTSIDE the project tree at ~/arthur/lib/, only resolvable at runtime
    // (and only on Daniel's Mac; in the Fly container the require throws and
    // we catch into the fallback below). Using `await import(variable)` would
    // ALSO break Turbopack — it emits <dynamic> for non-literal import args,
    // which broke 3 unrelated pages (settings/email, superlearner, brain) on
    // deploy 2026-05-11 even though those pages don't touch this module.
    const dynamicRequire = eval('require');
    ({ checkDomains, summarize, brandCollisionCheck } = dynamicRequire(domainModulePath));
  } catch {
    return "propose_project_concepts is only available when running locally on Daniel's Mac (the brand-strategy + domain-check module lives in ~/arthur/, not in the dashboard's deployment). Use the Arthur TUI for this command, or ask Daniel to run it.";
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // Generate 8 candidates (we filter to 5 that have usable domains)
  const sys = `You are a senior brand strategist and product designer working with Daniel May (Aspen & May / LOVELEEDAY Studios). Daniel just gave you a vague project brief. Propose 8 distinct named concept directions AND 3-5 clarifying questions.

Output ONLY valid JSON, no preamble:
{
  "questions": ["...", "..."],
  "concepts": [
    { "name": "<distinctive product name>", "slug": "<kebab-lowercase, no .tld>", "tagline": "<one-line positioning>", "audience": "<who it's for>", "vibe": "<3-4 brand-vibe adjectives>", "hero_archetype": "split-image-right|split-image-left|centered-bold-stamp|fullbleed-image-overlay|stacked-narrative|asymmetric-grid-collage", "differentiator": "<why this version is novel — what's the wedge>" }
  ]
}

Rules:
- Names MUST be distinctive (think Linear, Notion, Hum, Foundry, Quartz, Coda — not "ResMate" or "BookEasy"). Bias toward 1-2 syllable names that have a chance of being available across .com/.io/.ai/.co. Avoid common single-dictionary-word names alone (e.g. "Plate" is almost certainly taken; "Slate" / "Plateroom" / coined twist is more findable).
- Each concept MEANINGFULLY DIFFERENT (different audience OR vertical OR positioning angle).
- Hero archetype must match brand vibe (luxury → fullbleed-image-overlay, dev tool → centered-bold-stamp, B2B SaaS → split-image-right, etc.).`;
  const user = `Brief: "${brief}"${constraints ? `\nKnown constraints: ${constraints}` : ''}`;
  try {
    const resp = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 2500, system: sys, messages: [{ role: 'user', content: user }] });
    const text = (resp.content[0] as { type: string; text?: string })?.text || '';
    const cleaned = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    let parsed: { questions?: string[]; concepts?: Array<{ name: string; slug?: string; tagline: string; audience: string; vibe: string; hero_archetype: string; differentiator: string }> } = {};
    try { parsed = JSON.parse(cleaned); } catch { return `propose_project_concepts: parse failed — raw output:\n${text.slice(0, 800)}`; }
    const candidates = parsed.concepts || [];

    // Domain + brand-collision checks in parallel for all candidates
    const enriched = await Promise.all(candidates.map(async (c) => {
      const slug = (c.slug || c.name || '').toLowerCase().replace(/[^a-z0-9-]+/g, '');
      const dmap = slug ? await checkDomains(slug) : {};
      const sum = summarize(dmap);
      const collision = await brandCollisionCheck(c.name, c.audience).catch(() => null);
      return { ...c, _slug: slug, _domains: dmap, _domain_summary: sum, _brand_collision: collision };
    }));

    // Filter: prefer concepts with at least one available domain + no obvious brand collision; top 5
    const filtered = enriched
      .filter((c) => c._domain_summary.anyAvailable && !/COLLISION/i.test(c._brand_collision || ''))
      .slice(0, 5);
    const final = filtered.length >= 3 ? filtered : enriched.slice(0, 5);

    const out: string[] = [];
    out.push(`PROPOSED CONCEPTS for "${brief.slice(0, 80)}" — names verified available:`);
    out.push('');
    final.forEach((c, i) => {
      out.push(`${i + 1}. **${c.name}** — ${c.tagline}`);
      out.push(`   Audience: ${c.audience}`);
      out.push(`   Vibe: ${c.vibe} · Hero: ${c.hero_archetype}`);
      out.push(`   Differentiator: ${c.differentiator}`);
      out.push(`   Domains: ${c._domain_summary.summary}`);
      if (c._domain_summary.vercel_links?.length) out.push(`   Buy via Vercel: ${c._domain_summary.vercel_links[0]}`);
      if (c._brand_collision) out.push(`   Brand check: ${c._brand_collision.slice(0, 140)}`);
      out.push('');
    });
    if (Array.isArray(parsed.questions) && parsed.questions.length) {
      out.push('FOLLOW-UP QUESTIONS to narrow scope:');
      parsed.questions.forEach((q, i) => out.push(`  ${i + 1}. ${q}`));
      out.push('');
    }
    out.push("Pick a concept by name to proceed (e.g. 'go with Quartz') OR answer the questions to refine, OR say 'propose more' for fresh directions.");
    return out.join('\n');
  } catch (e: unknown) {
    return `propose_project_concepts error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function toolBuildNewProject(args: { slug?: string; name?: string; description?: string; domain?: string; category?: string; audience?: string; tier?: string; budget_cap_usd?: number }): Promise<string> {
  const slug = (args.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const description = (args.description || '').trim();
  if (!slug || !description) return "build_new_project: slug + description required";
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');
  const child = await import('node:child_process');
  const buildId = `build-${Date.now()}-${slug}`;
  const briefPath = path.join(os.homedir(), '.arthur', 'briefs', `${buildId}.json`);
  fs.mkdirSync(path.dirname(briefPath), { recursive: true });
  const brief = {
    version: '1', id: buildId, created_at: new Date().toISOString(),
    tier: args.tier || '500',
    project: {
      name: args.name || slug.charAt(0).toUpperCase() + slug.slice(1),
      slug, domain: args.domain || `${slug}.com`, description,
      category: args.category, audience: args.audience,
    },
    brand: { voice: { formality: 5, warmth: 7, wit: 6, urgency: 4 } },
    deploy: { host: 'vercel', github_repo: `LOVELEEDAY-Studios/${slug}` },
    budget: { build_cap_usd: args.budget_cap_usd ?? 5 },
  };
  fs.writeFileSync(briefPath, JSON.stringify(brief, null, 2));
  // Spawn arthur-build in background, detached, redirect output to log
  const logPath = path.join(os.homedir(), '.arthur', 'builds', buildId, 'spawn.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const out = fs.openSync(logPath, 'a');
  const proc = child.spawn('/opt/homebrew/bin/arthur-build', ['--brief', briefPath], {
    detached: true, stdio: ['ignore', out, out],
  });
  proc.unref();
  return [
    `BUILD STARTED — ${slug}`,
    ``,
    `build_id: ${buildId}`,
    `brief: ${briefPath}`,
    `events: ~/.arthur/builds/${buildId}/events.jsonl`,
    `pid: ${proc.pid}`,
    ``,
    `Pipeline runs ~25 min. The deploy URL will auto-open in your browser when stage 14 completes.`,
    `Ask "how is the ${slug} build going" to check status.`,
  ].join('\n');
}

async function toolAuditAndRebuildSite(args: { target_url?: string; routes?: string; phase?: string }): Promise<string> {
  const url = (args.target_url || '').trim();
  if (!url) return "audit_and_rebuild_site: target_url required";
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');
  const child = await import('node:child_process');
  const jobId = `audit-${Date.now()}-${url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`;
  const logPath = path.join(os.homedir(), '.arthur', 'audit', jobId, 'spawn.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const out = fs.openSync(logPath, 'a');
  const cliArgs = [path.join(os.homedir(), 'arthur', 'scripts', 'audit-and-rebuild.mjs'), url];
  if (args.routes) cliArgs.push(`--routes=${args.routes}`);
  if (args.phase) cliArgs.push(`--phase=${args.phase}`);
  const proc = child.spawn('bun', cliArgs, { detached: true, stdio: ['ignore', out, out] });
  proc.unref();
  return [
    `AUDIT JOB STARTED — ${url}`,
    ``,
    `job_id: ${jobId}`,
    `log: ${logPath}`,
    `pid: ${proc.pid}`,
    ``,
    `NOTE: audit-and-rebuild pipeline is SKELETON-only as of 2026-05-09. The entry point runs and prints a phase plan but full implementation is multi-day. For now this returns the plan; for actual rebuild work, drive via Claude Code session.`,
  ].join('\n');
}

async function toolGetBuildStatus(args: { build_id?: string }): Promise<string> {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');
  const buildsDir = path.join(os.homedir(), '.arthur', 'builds');
  if (!fs.existsSync(buildsDir)) return "no builds found";
  let buildId = args.build_id;
  if (!buildId) {
    // Pick the most-recently-modified build dir
    const dirs = fs.readdirSync(buildsDir).filter(d => d.startsWith('build-'));
    if (!dirs.length) return "no builds found";
    dirs.sort((a, b) => fs.statSync(path.join(buildsDir, b)).mtimeMs - fs.statSync(path.join(buildsDir, a)).mtimeMs);
    buildId = dirs[0];
  }
  const buildDir = path.join(buildsDir, buildId);
  if (!fs.existsSync(buildDir)) return `build_id ${buildId} not found at ${buildDir}`;
  const eventsPath = path.join(buildDir, 'events.jsonl');
  let lastStage = '—', stagesDone = 0, totalCost = 0, terminalStatus: 'in_flight' | 'done' | 'failed' = 'in_flight', failReason = '';
  if (fs.existsSync(eventsPath)) {
    const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n');
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        if (e.type === 'stage_start') lastStage = e.stage;
        if (e.type === 'stage_complete') { stagesDone++; totalCost += e.cost_usd || 0; }
        if (e.type === 'build_done') terminalStatus = 'done';
        if (e.type === 'build_fail') { terminalStatus = 'failed'; failReason = e.reason || ''; }
      } catch {}
    }
  }
  // Check for deploy URL
  let liveUrl = '';
  const probePath = path.join(buildDir, 'deploy', 'probe.json');
  if (fs.existsSync(probePath)) {
    try { liveUrl = JSON.parse(fs.readFileSync(probePath, 'utf8')).liveUrl || ''; } catch {}
  }
  return [
    `Build: ${buildId}`,
    `Status: ${terminalStatus}`,
    `Last stage: ${lastStage} · Stages complete: ${stagesDone}`,
    `Cost so far: $${totalCost.toFixed(3)}`,
    failReason ? `Reason: ${failReason}` : '',
    liveUrl ? `🚀 Live: ${liveUrl}` : '',
  ].filter(Boolean).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool dispatch
// ─────────────────────────────────────────────────────────────────────────────

async function executeTool(name: string, argsStr: string): Promise<string> {
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(argsStr || "{}"); } catch { /* empty args */ }

  switch (name) {
    case "get_cash_balance":  return toolGetCashBalance();
    case "query_inbox":       return toolQueryInbox(args as Parameters<typeof toolQueryInbox>[0]);
    case "query_legal":       return toolQueryLegal(args as Parameters<typeof toolQueryLegal>[0]);
    case "query_brain_graph": return toolQueryBrainGraph(args as Parameters<typeof toolQueryBrainGraph>[0]);
    case "query_memory":      return toolQueryMemory(args as Parameters<typeof toolQueryMemory>[0]);
    case "MemorySearch":      return toolMemorySearch(args as Parameters<typeof toolMemorySearch>[0]);
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
    case "propose_project_concepts":  return toolProposeProjectConcepts(args as Parameters<typeof toolProposeProjectConcepts>[0]);
    case "build_new_project":         return toolBuildNewProject(args as Parameters<typeof toolBuildNewProject>[0]);
    case "audit_and_rebuild_site":    return toolAuditAndRebuildSite(args as Parameters<typeof toolAuditAndRebuildSite>[0]);
    case "get_build_status":          return toolGetBuildStatus(args as Parameters<typeof toolGetBuildStatus>[0]);
    case "search_flights":      return toolSearchFlights(args as Parameters<typeof toolSearchFlights>[0]);
    case "find_hotels":         return toolFindHotels(args as Parameters<typeof toolFindHotels>[0]);
    default:                  return `Unknown tool: ${name}`;
  }
}

async function toolFindHotels(args: { location?: string; check_in?: string; check_out?: string; guests?: number; rooms?: number; max_price_per_night_usd?: number }): Promise<string> {
  if (!args.location || !args.check_in || !args.check_out) {
    return "find_hotels error: location, check_in (YYYY-MM-DD), check_out (YYYY-MM-DD) all required";
  }
  // Per kernel Rule 24 (API-first): try Hotelbeds (autonomous B2B API) BEFORE
  // Duffel Stays (invitation-only) and aggregator deep links (fragile).
  const { searchHotelbeds } = await import("@/lib/travel/hotelbeds");
  const hb = await searchHotelbeds({
    location: args.location,
    check_in: args.check_in,
    check_out: args.check_out,
    guests: args.guests,
    rooms: args.rooms,
    max_price_per_night_usd: args.max_price_per_night_usd,
  });
  if (hb.ok && hb.offers.length > 0) {
    const nights = hb.offers[0].nights;
    const lines = hb.offers.map((o, i) =>
      (i + 1) + ". " + o.name + (o.rating ? " (" + o.rating + "*)" : "") + (o.category ? " [" + o.category + "]" : "") + "\n   " + (o.address || o.city || "") + "\n   $" + o.per_night_amount + "/night * " + nights + " = **$" + o.total_amount + " total** " + o.total_currency + "\n   " + (o.refundable ? "Free cancellation" : (o.cancellation_policy || "Non-refundable")) + "\n   Rate key: " + (o.hotelbeds_rate_key || "n/a") + "\n   Book: " + o.booking_url
    ).join("\n\n");
    const banner = hb.sandbox ? "\n\n*Hotelbeds sandbox token - sandbox prices are TEST data; switch HOTELBEDS_ENV=production once your live key is approved.*" : "";
    return "Found " + hb.offers.length + " hotels in " + args.location + " (" + args.check_in + " -> " + args.check_out + ", " + nights + " night" + (nights > 1 ? "s" : "") + ") via Hotelbeds:" + banner + "\n\n" + lines + "\n\nTo book: tell me the number. I will create a Stripe Link spend-request for the total and route push approval to your phone. Klarna option also available - say the word.";
  }
  // Hotelbeds failed (e.g. no keys yet) -> try Duffel Stays (invitation-only)
  const hbError = hb.ok ? "(no offers)" : hb.error;
  const { searchHotels, isTestToken } = await import("@/lib/travel/duffel");

  if (isTestToken()) {
    const googleHotels = "https://www.google.com/travel/hotels?q=" + encodeURIComponent(args.location) + "&checkin=" + args.check_in + "&checkout=" + args.check_out + "&guests=" + (args.guests || 2);
    const bookingCom = "https://www.booking.com/searchresults.html?ss=" + encodeURIComponent(args.location) + "&checkin=" + args.check_in + "&checkout=" + args.check_out + "&group_adults=" + (args.guests || 2) + "&no_rooms=" + (args.rooms || 1);
    const expedia = "https://www.expedia.com/Hotel-Search?destination=" + encodeURIComponent(args.location) + "&startDate=" + args.check_in + "&endDate=" + args.check_out + "&adults=" + (args.guests || 2) + "&rooms=" + (args.rooms || 1);
    return "⚠️ Duffel sandbox token in use — sandbox returns fictional hotel offers. Upgrade at dashboard.duffel.com → Developers → Live access.\n\nDirect aggregator links for " + args.location + " (" + args.check_in + " → " + args.check_out + ", " + (args.guests || 2) + " guests):\nGoogle Hotels: " + googleHotels + "\nBooking.com: " + bookingCom + "\nExpedia: " + expedia + "\n\nClick one to see real rates — Phase 1 research only.";
  }

  const r = await searchHotels({
    location: args.location,
    check_in: args.check_in,
    check_out: args.check_out,
    guests: args.guests,
    rooms: args.rooms,
    max_price_per_night_usd: args.max_price_per_night_usd,
  });
  if (!r.ok) {
    const googleHotels = "https://www.google.com/travel/hotels?q=" + encodeURIComponent(args.location) + "&checkin=" + args.check_in + "&checkout=" + args.check_out;
    return "find_hotels error: " + r.error + "\n\nFallback: " + googleHotels;
  }
  if (r.offers.length === 0) {
    return "find_hotels: no offers found for " + args.location + " " + args.check_in + "→" + args.check_out + ".";
  }
  const nights = r.offers[0].nights;
  const lines = r.offers.map((o, i) =>
    (i + 1) + ". " + o.name + (o.rating ? " (" + o.rating + "★)" : "") + "\n   " + (o.address || "") + "\n   $" + o.per_night_amount + "/night × " + nights + " = **$" + o.total_amount + " total** " + o.total_currency + "\n   " + (o.cancellation_policy ? "Cancellation: " + o.cancellation_policy : "") + "\n   Book: " + o.booking_url
  ).join("\n\n");
  return "Found " + r.offers.length + " hotels in " + args.location + " (" + args.check_in + " → " + args.check_out + ", " + nights + " night" + (nights > 1 ? "s" : "") + "):\n\n" + lines + "\n\nWhich one should I book? I can issue a Stripe Link virtual card for the total OR drive merchant checkout to Klarna for sign-off.";
}

async function toolSearchFlights(args: { origin?: string; destination?: string; depart_date?: string; return_date?: string; passengers?: number; cabin?: "economy" | "premium_economy" | "business" | "first"; max_connections?: number }): Promise<string> {
  if (!args.origin || !args.destination || !args.depart_date) {
    return "search_flights error: origin, destination, and depart_date (YYYY-MM-DD) all required";
  }
  const { searchFlights, isTestToken, normalizeIATA } = await import("@/lib/travel/duffel");

  // Helper: build deep links for the user to click. Used when in test mode
  // (no real data) OR as a fallback when Duffel returns no offers / errors.
  const orig = normalizeIATA(args.origin) || args.origin.toUpperCase();
  const dest = normalizeIATA(args.destination) || args.destination.toUpperCase();
  const dd = args.depart_date;
  const rd = args.return_date;
  const tripType = rd ? "roundtrip" : "oneway";
  const googleFlightsUrl = rd
    ? `https://www.google.com/travel/flights?q=Flights%20from%20${orig}%20to%20${dest}%20on%20${dd}%20returning%20${rd}`
    : `https://www.google.com/travel/flights?q=Flights%20from%20${orig}%20to%20${dest}%20on%20${dd}`;
  const kayakUrl = `https://www.kayak.com/flights/${orig}-${dest}/${dd}${rd ? `/${rd}` : ""}`;
  const skyscannerUrl = `https://www.skyscanner.com/transport/flights/${orig.toLowerCase()}/${dest.toLowerCase()}/${dd.replace(/-/g, "").slice(2)}/${rd ? rd.replace(/-/g, "").slice(2) : ""}`;
  const deepLinks = [
    `Google Flights: ${googleFlightsUrl}`,
    `Kayak: ${kayakUrl}`,
    `Skyscanner: ${skyscannerUrl}`,
  ].join("\n");

  // GUARD: Duffel TEST tokens return fictional mock offers. NEVER present
  // those as real flights — that's hallucination dressed in JSON. Caught
  // 2026-05-07: Telegram showed "British Airways $37.70 GRR→ORD" — that
  // route doesn't exist. Daniel called this out. Now: in test mode, fall
  // back to a REAL Perplexity-backed web search for current fares instead
  // of just deep links. Better path than mock data.
  if (isTestToken()) {
    const query = `cheapest flights from ${orig} to ${dest} on ${dd}${rd ? ` returning ${rd}` : ""} 2026 ${args.cabin || "economy"}`;
    let webResearch = "";
    try {
      const wr = await toolWebSearch({ query });
      if (typeof wr === "string" && wr.length > 50 && !wr.startsWith("web_search error")) {
        webResearch = `\n\nLive fare research (via web_search):\n${wr.slice(0, 1500)}`;
      }
    } catch { /* fall through to just deep links */ }
    return `⚠️ Duffel sandbox token in use — sandbox returns fictional offers, so I'm not quoting Duffel prices. Apply for a Duffel live token at dashboard.duffel.com → Developers → Live access (or sign up at developers.amadeus.com for free 10K-call/mo Amadeus access — Daniel can paste the API key into the vault).${webResearch}\n\nDirect aggregator links for ${orig}→${dest} (${tripType}, depart ${dd}${rd ? `, return ${rd}` : ""}):\n${deepLinks}\n\nClick one to see and book real fares — Phase 1 research only.`;
  }

  const r = await searchFlights({
    origin: args.origin,
    destination: args.destination,
    depart_date: args.depart_date,
    return_date: args.return_date,
    passengers: args.passengers,
    cabin: args.cabin,
    max_connections: args.max_connections,
  });
  if (!r.ok) {
    // Hard fallback to deep links on any Duffel error
    return `search_flights error: ${r.error}\n\nUse these aggregators instead:\n${deepLinks}`;
  }
  if (r.offers.length === 0) {
    return `search_flights: no offers found for ${orig}→${dest} on ${dd} via Duffel.\n\nTry these aggregators:\n${deepLinks}`;
  }
  // Compact summary the LLM can format for the user (LIVE token only)
  const lines = r.offers.map((o, i) =>
    `${i + 1}. ${o.total} on ${o.airline} — ${o.slices.map((s: { from: string; to: string; stops: number; depart: string; flights: string[] }) => `${s.from}→${s.to} (${s.stops} stop${s.stops === 1 ? "" : "s"}, ${s.depart?.slice(0, 16) || "?"})`).join(" / ")}`
  );
  return `search_flights returned ${r.offers.length} live Duffel offers:\n${lines.join("\n")}\n\nDeep links to verify and book:\n${deepLinks}\n\nPhase 1 research only — Daniel books manually after reviewing.`;
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
    // Upsert sessions metadata so the sidebar list stays fresh. Title is
    // the first user message we see for this session; later messages just
    // bump last_message_at and don't overwrite the title.
    if (role === "user") {
      const title = content.replace(/\s+/g, " ").trim().slice(0, 60);
      const { data: existing } = await db
        .from("arthur_chat_sessions")
        .select("id, title")
        .eq("id", sessionId)
        .maybeSingle();
      if (existing) {
        await db.from("arthur_chat_sessions")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", sessionId);
      } else {
        await db.from("arthur_chat_sessions").insert({
          id: sessionId,
          title,
          last_message_at: new Date().toISOString(),
        });
      }
    } else {
      await db.from("arthur_chat_sessions")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", sessionId);
    }
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
    // Date arithmetic — must call get_current_datetime, never compute from training memory.
    // Caught 2026-05-12 stress: "days until June 30" → 474 (wrong), "day of week Jan 1 2024" → Monday (wrong).
    "days until", "weeks until", "months until", "days since", "weeks since",
    "day of the week", "day of week", "what day was", "what day is",
    "expire", "expires", "expiration", "deadline", "due date", "anniversary",
    "how long until", "how long ago", "how many days", "how many weeks",
    // Specific live markets / macro — same pattern, no training-data lookups.
    "s&p", "s and p", "spx", "nasdaq", "dow jones", "djia", "russell",
    "treasury yield", "10-year", "10 year yield", "fed rate", "fed funds",
    "cpi", "ppi", "gdp", "unemployment rate", "jobs report", "payrolls",
    "inflation", "interest rate",
    "ethereum", "eth", "btc", "solana", "doge", "altcoin",
    // 2026-05-25 — common MUTATE verbs missed by existing list
    "post on", "post to", "tweet", "share on", "share with", "publish to",
    "book a", "book the", "reserve", "make a reservation",
    "add to ", "add the ", "include in", "append to",
    "update the", "modify the", "change the", "edit the", "rename",
    "delete", "remove from", "unsubscribe",
    "transfer", "wire ", "pay ", "send money", "venmo ", "zelle ",
    "set a", "set up", "set the ", "configure", "wire", "deploy",
  ];
  if (toolKeywords.some(kw => text.includes(kw))) return true;

  // 2026-05-25 final safety net — verb+entity regex catches novel mutate prompts
  // not on the keyword list (e.g. "ping Mike about the catering quote",
  // "draft a tweet for Friday's event", "delete the test playlist").
  // Mirrors chat-fallback.js TOOL_REQUIRED_RE — keep in sync.
  const TOOL_VERB_ENTITY_RE = /\b(send|email|text|sms|message|ping|notify|post|tweet|share|publish|schedule|book|reserve|create|add|update|modify|change|edit|rename|delete|remove|cancel|reschedule|invoice|charge|refund|pay|transfer|draft|write|reply|forward|fetch|search|find|look ?up|check|query|pull|get|list|show|set|configure|deploy|push|sync|backup|export|import)\b.{0,40}\b(email|message|reservation|booking|invoice|appointment|calendar|inbox|task|order|payment|customer|guest|event|account|status|balance|playlist|playlist|file|folder|tweet|post|listing|profile|page|website|domain|user|contact|note|reminder|todo|password|api|key|secret|env|setting|config|webhook|cron|deployment|build|repo|branch|commit|pr|issue|ticket)\b/i;
  return TOOL_VERB_ENTITY_RE.test(text);
}

// Current-events detector — force web_search before answering. Caught
// 2026-05-07 in Telegram audit: Arthur fabricated specific Super Bowl
// score+date+teams from training data instead of searching. Rule 17
// (hallucination defense) requires tool-call before any factual claim
// about live/current state. This regex triggers a system-level "you MUST
// web_search first" nudge that makes the model actually call the tool.
const CURRENT_EVENTS_RE = /\b(latest|current|currently|right now|today|tonight|this (week|month|year|morning|evening)|recent|news|headlines|won the|score|stock( price)?|share price|market cap|valuation|election|president|ceo|prime minister|champion|world cup|super bowl|world series|stanley cup|nba finals|olympics|world record|stock|crypto|bitcoin|ethereum|btc|eth|s&p|spx|nasdaq|dow|treasury|cpi|ppi|gdp|inflation|interest rate|fed funds|fed rate|jobs report|unemployment rate|weather|temperature|forecast|humidity|wind speed|precipitation)\b/i;

// Multi-variable analytics detector — when a prompt asks for math with
// multiple inputs (labor + cost + revenue + capacity), Arthur tends to
// silently invent missing variables instead of stating assumptions. The
// 2026-05-12 deep-analytics stress caught this pattern on 5/25 prompts —
// all 5 in operations / queueing / scheduling categories where the prompt
// has missing-variable structure ("3 bartenders, 4 servers... labor cost
// for the night?" — missing shift length, missing tips, missing benefits).
const COMPLEX_ANALYTICS_RE = /\b(calculate|compute|how much|how many|breakeven|break even|model|scenario|sensitivity|what would|what's the|what is the)\b.{0,200}\b(if|when|given|assume|with|at|per|holding|while|but|and)\b/i;

function isComplexAnalytics(messages: OpenAIMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = (typeof lastUser?.content === "string" ? lastUser.content : "");
  if (!text || text.length < 80) return false;  // short prompts are usually trivial
  return COMPLEX_ANALYTICS_RE.test(text);
}

function isCurrentEventsQuery(messages: OpenAIMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = (typeof lastUser?.content === "string" ? lastUser.content : "").toLowerCase();
  if (!text) return false;
  return CURRENT_EVENTS_RE.test(text);
}

async function callLLM(messages: OpenAIMessage[], withTools: boolean): Promise<{ response: LLMResponse; provider: string } | null> {
  // Delegates to lib/router.ts which walks the canonical 18-tier ladder with
  // tool-capable filter. This file no longer hardcodes the chain — adding a new
  // tier is a one-place edit in lib/router.ts TIERS.
  const { routeToLLM, TIERS: _TIERS } = await import("@/lib/router");
  void _TIERS; // referenced for type clarity
  const requiresTools = withTools && promptNeedsTools(messages);

  // Hallucination defense: if the prompt asks about live/current world facts
  // (sports scores, stock prices, news, current officials, etc.), inject a
  // system message ordering web_search BEFORE answering. Without this nudge
  // the model frequently answers from stale training data and invents
  // specific scores/dates/people. Verified live 2026-05-07 (Super Bowl).
  let nudgedMessages = messages;

  // Analytics-complexity nudge — fires when prompt looks quantitative with
  // conditional structure ("if X then Y"). Forces Arthur to state assumptions
  // explicitly BEFORE doing math, instead of silently inventing missing
  // variables (the 2026-05-12 deep-analytics stress failure mode).
  if (isComplexAnalytics(messages)) {
    nudgedMessages = [
      {
        role: "system",
        content:
          "QUANTITATIVE ANALYSIS PROMPT. Before doing any math:\n\n" +
          "1. State explicitly what variables the user gave you and what variables are MISSING.\n" +
          "2. For each missing variable, EITHER ask the user, OR state your assumption in one sentence (\"assuming a 7-hour shift\", \"assuming tips are excluded\").\n" +
          "3. Then show the math step by step. Use Geist Mono notation: 12 × $14 = $168.\n" +
          "4. End with the single number answer.\n\n" +
          "Forbidden: inventing values silently (e.g. assuming 1 server when the prompt said 3, or assuming a shift length when none was given). If the prompt is genuinely under-specified, refuse with a one-sentence \"need [variable] to compute\" and stop.\n\n" +
          "This is a quantitative problem, not a chat question — treat numbers as load-bearing.",
      },
      ...nudgedMessages,
    ];
  }

  if (requiresTools && isCurrentEventsQuery(messages)) {
    nudgedMessages = [
      {
        role: "system",
        content:
          "LIVE-DATA QUERY DETECTED — strict rules apply.\n\n" +
          "Step 1: Try web_search FIRST. If you have a tool result this turn, you may quote it.\n\n" +
          "Step 2: If web_search returns nothing useful, or you cannot call it, you MUST refuse — DO NOT fall back to training memory. " +
          "Training data is months old and you WILL fabricate a specific number that looks confident but is fictional.\n\n" +
          "ZERO TOLERANCE for these fabricated specifics: any temperature (°F or °C), any stock price, any crypto price, " +
          "any CPI/PPI/GDP/inflation/unemployment percent, any sports score, any weather condition string ('overcast', 'partly cloudy', '13 mph wind'), any 'feels like' value, any humidity percent.\n\n" +
          "If you don't have a live tool result, respond with ONE short sentence: \"I'd need a live data tool for that — none wired right now.\" Then stop. Do not pad. Do not estimate. Do not give a range.\n\n" +
          "The user's eval harness flags any specific live number without a same-turn tool result as a fabrication failure.",
      },
      ...messages,
    ];
  }

  const result = await routeToLLM(nudgedMessages as Parameters<typeof routeToLLM>[0], {
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
  const _requestStart = Date.now();
  // Phase timing. Black-box measurement showed a bimodal time-to-first-byte
  // (~930ms vs ~3400ms) that could not be attributed to any single phase from
  // outside. Each mark() records cumulative ms from request entry; the deltas
  // between them name the slow phase instead of guessing at it.
  const _phases: Record<string, number> = {};
  const mark = (name: string) => { _phases[name] = Date.now() - _requestStart; };
  const deny = authGate(req, { allowReadFromBrowser: false });
  if (deny) return deny;

  // Rate limit chat: 30 requests/min to protect Anthropic API quota
  const rl = await rateLimit("chat", 30, 60);
  mark("rateLimit");
  if (rl) return rl;

  let payload: unknown;
  try { payload = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Back-compat: accept either { prompt: string } OR { messages: [{role, content}, ...] }.
  // The Telegram bot (arthur-telegram.js callBackplane) sends `messages`. The
  // dashboard chat sends `prompt`. Without this fallback Telegram breaks with
  // 400 "prompt required" — verified live in browser at 2026-05-07.
  type ChatAttachment = { name?: string; mime_type?: string; size?: number; storage_path?: string; url?: string };
  const body = (payload || {}) as { prompt?: string; messages?: Array<{ role?: string; content?: unknown }>; session_id?: string; attachments?: ChatAttachment[] };

  // ─── MULTIMODAL FAST PATH (2026-05-28) ──────────────────────────────────
  // If attachments are present, build a multimodal Anthropic request directly.
  // PDFs → type:document, images → type:image, text-like → type:text (utf-8).
  // Office/audio/video docs require pandoc/ffmpeg/whisper which only the
  // Telegram surface has installed; we surface a graceful "use Telegram for X"
  // note in attachment_notes.
  if (Array.isArray(body.attachments) && body.attachments.length > 0) {
    try {
      const sessionId = (typeof body.session_id === "string" && body.session_id.trim()) ? body.session_id.trim() : randomUUID();
      const userText: string = typeof body.prompt === "string" ? body.prompt : "";
      const sb = getSupabaseAdmin();
      const BUCKET = "arthur-chat-uploads";

      type AnthropicBlock =
        | { type: "text"; text: string }
        | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
        | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

      const blocks: AnthropicBlock[] = [];
      const notes: string[] = [];

      for (const att of body.attachments) {
        if (!att?.storage_path && !att?.url) continue;
        let buf: Buffer | null = null;
        try {
          if (att.storage_path) {
            const { data, error } = await sb.storage.from(BUCKET).download(att.storage_path);
            if (error || !data) throw new Error(error?.message || "download failed");
            buf = Buffer.from(await data.arrayBuffer());
          } else if (att.url) {
            const r = await fetch(att.url);
            if (!r.ok) throw new Error(`fetch ${r.status}`);
            buf = Buffer.from(await r.arrayBuffer());
          }
        } catch (e) {
          notes.push(`skip ${att.name || "(no name)"}: ${(e as Error).message}`);
          continue;
        }
        if (!buf) continue;
        if (buf.length > 32 * 1024 * 1024) { notes.push(`skip ${att.name}: >32MB`); continue; }
        const mt = (att.mime_type || "").toLowerCase();
        const name = att.name || "file";
        try {
          const { convertToAnthropicContent } = await import("@/lib/document/universal-converter");
          const r = await convertToAnthropicContent(buf, name, mt);
          for (const b of r.blocks) blocks.push(b);
          for (const n of r.notes) notes.push(name + ": " + n);
        } catch (e) {
          notes.push("skip " + name + ": " + (e as Error).message);
        }
      }

      blocks.push({ type: "text", text: userText || "Read the attached file(s) and tell me what's in them. Be specific — surface anything Daniel would want flagged (pricing, signatures, action items, deadlines, things that look off). Keep it tight." });

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey });
      const sys = await buildPersona({ surface: "dashboard" });
      const resp = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: sys,
        // @ts-expect-error multimodal content array — Anthropic SDK accepts it
        messages: [{ role: "user", content: blocks }],
      });
      const text = (resp.content || []).filter((b: { type: string }) => b.type === "text").map((b: { type: string; text?: string }) => b.text || "").join("").trim();

      try {
        const tag = `[attachments=${body.attachments.length}: ${body.attachments.map(a => a.name || "?").join(", ")}]`;
        await persistMessage(sessionId, "user", userText ? `${userText} ${tag}` : tag, { metadata: { attachments: body.attachments } });
        await persistMessage(sessionId, "assistant", text, { metadata: { multimodal: true, blocks: blocks.length } });
      } catch { /* persistence non-fatal */ }

      return NextResponse.json({
        response: text || "Got the file(s) but couldn't generate a useful response.",
        session_id: sessionId,
        multimodal: true,
        attachment_notes: notes,
      });
    } catch (e) {
      const msg = (e as Error).message || "multimodal handler failed";
      console.error("[chat/route] multimodal fast path err:", msg);
      return NextResponse.json({ error: `multimodal error: ${msg}` }, { status: 500 });
    }
  }
  // ─── END MULTIMODAL FAST PATH ───────────────────────────────────────────

  let prompt: string | undefined = body.prompt;
  const clientSessionId = body.session_id;
  if ((!prompt || typeof prompt !== "string" || !prompt.trim()) && Array.isArray(body.messages) && body.messages.length > 0) {
    // Pull the last user message text as the prompt
    for (let i = body.messages.length - 1; i >= 0; i--) {
      const m = body.messages[i];
      if (m?.role === "user" && typeof m.content === "string" && m.content.trim()) {
        prompt = m.content;
        break;
      }
      if (m?.role === "user" && Array.isArray(m.content)) {
        const txt = (m.content as Array<{ type?: string; text?: string }>)
          .filter((p) => p.type === "text" && typeof p.text === "string")
          .map((p) => p.text)
          .join("\n");
        if (txt.trim()) { prompt = txt; break; }
      }
    }
  }
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "prompt required (or messages[] with a user message)" }, { status: 400 });
  }

  const sessionId = (clientSessionId && typeof clientSessionId === "string" && clientSessionId.trim())
    ? clientSessionId.trim()
    : randomUUID();

  // Everything from here to the messages array is Supabase/network work whose
  // result the reader never sees directly. Phase timing (2026-08-09) measured
  // history at +1319ms and rateLimit at +582ms on the slow path, all of it
  // blocking the stream from opening. Wrapped so the streaming path can open
  // the stream FIRST and run this inside it — first byte then no longer waits
  // on Supabase at all. Both paths call it exactly once.
  let systemPrompt: string = "";
  let messages: OpenAIMessage[] = [];
  // Hoisted: assigned inside buildTurn(), read by the done event outside it.
  let memoryError: string | null = null;
  let memoryHits = 0;
  const buildTurn = async () => {
    // 1. Fetch context digest + history in parallel
    mark("preHistory");
    const [contextDigest, history] = await Promise.all([
      buildContextDigest(),
      loadHistory(sessionId, 20),
    ]);

    // 1b. Resolve user's current location from their IP (cached 1h)
    // Canonical user-location: read from arthur_user_location row (Mac cron upserts every 5min).
    // Fall back to request-IP geo if the table is stale (>30min old) or missing.
    mark("history");
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

    // 1c. Semantic memory retrieval — top-3 similar past turns from the corpus.
    // Uses Supabase backend (arthur_corpus_embeddings table, pgvector similarity).
    // Embeds via Ollama nomic-embed-text if OLLAMA_EMBED_URL is set, otherwise
    // skips gracefully (empty hits, no crash). Non-blocking — fires in parallel
    // with location resolution above but awaited before system prompt is built.
    let memoryContext = "";
    try {
      mark("location");
      const { retrieveSimilar: retrieveMemory } = await import("@/lib/memory");
      const memHits = await retrieveMemory(prompt, 3, {
        embeddingsSource: "supabase",
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        embedUrl: process.env.OLLAMA_EMBED_URL || undefined,
      });
        memoryHits = memHits.length;
    if (memHits.length > 0) {
        memoryContext = "\n\nRELEVANT PAST CONTEXT (semantic memory, ranked by similarity):\n" +
          memHits.map((h, i) =>
            `[${i + 1}] (score ${h.score}${h.timestamp ? `, ${h.timestamp.slice(0, 10)}` : ""})\n` +
            `Q: ${h.input.slice(0, 200)}\n` +
            `A: ${h.output_preview.slice(0, 300)}`
          ).join("\n\n");
      }
    } catch (e) {
      // Chat still proceeds — but the failure is LOUD, not swallowed. Recall was
      // dead for weeks because this catch turned a broken embedder into a silent
      // empty result set that looked exactly like "no relevant memories".
      memoryError = e instanceof Error ? e.message : String(e);
      console.error(`[chat/memory] RECALL FAILED — ${memoryError}`);
    }

    // 2. Build messages array
    // Decide once whether this turn needs tools, and build the system prompt
    // with or without tool definitions. Chat-only providers (Cerebras/Groq)
    // leak tool-call syntax as text when given tool definitions they can't honor.
    const turnRequiresTools = promptNeedsTools([{ role: "user", content: prompt }]);

    // ── LIVE PERSONA PULL — fetch latest persona from Supabase arthur_persona_live
    //    table (pushed by ~/arthur/lib/integration/persona-pusher.js on Daniel's
    //    Mac on every persona.ts mtime change). 60s in-memory cache.
    //    Falls back to bundled persona if Supabase row missing or stale > 24h.
    //    NO REDEPLOY NEEDED for persona edits.
    systemPrompt = buildSystemPrompt(contextDigest + memoryContext, currentLocation, turnRequiresTools);
    try {
      mark("memory");
      const livePersona = await livePullerFetch();
      if (livePersona) systemPrompt = livePersona;
    } catch { /* fallback to bundled */ }

    // ── COMMITMENT AUTO-SURFACE — cross-surface parity with TUI + Telegram.
    // If any commitment is due in the next hour (queried from local Arthur
    // data file, which exists when dashboard runs against the same DB), prepend
    // a reminder. In cloud Fly container the file doesn't exist; silent no-op.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const dynamicRequire = eval('require');
      const pm = dynamicRequire('os').homedir() + '/arthur/lib/agentic/project-memory';
      const projectMemory = dynamicRequire(pm);
      const due = projectMemory.dueSoon(3_600_000);
      if (due && due.length > 0) {
        systemPrompt += `\n\n[arthur reminder — ${due.length} commitment(s) due in next hour: ${due.map((c: any) => c.what.slice(0, 80)).join('; ')}]`;
      }
    } catch { /* dashboard running in cloud container — file unreachable, OK */ }

    mark("persona");
    messages = [
      { role: "system", content: systemPrompt },
      ...history.map((h): OpenAIMessage => {
        if (h.role === "tool") {
          // Tool results stored as a single message — re-expand as assistant tool call if needed
          return { role: "assistant", content: h.content };
        }
        return {
          role: h.role as OpenAIMessage["role"],
          content: h.content,
          ...(h.tool_calls ? { tool_calls: h.tool_calls as OpenAIToolCall[] } : {}),
        };
      }),
      { role: "user", content: prompt.slice(0, 8000) },
    ];
  };


  // 3. Pre-LLM work: persist the user turn, run the implicit-correction detector,
  //    and pull orchestrator enrichment. Extracted into one function so the
  //    streaming path can run it AFTER the stream is already open — none of this
  //    produces user-visible output, so making the reader wait on it (a Supabase
  //    round trip plus an HTTP call to the Modal orchestrator) is pure dead time.
  const runPreWork = async () => {
    await persistMessage(sessionId, "user", prompt);

    // Implicit-correction detector — fire before LLM, never blocks chat path
    try {
      const { maybeRecordImplicitCorrection } = await import("@/lib/training/implicit-correction-detector");
      await maybeRecordImplicitCorrection({ sessionId, userTurn: prompt });
    } catch { /* non-fatal */ }

    // Orchestrator pre-enrichment — when query matches multi-specialist heuristic,
    // pull specialist context + live-API data and inject into system prompt.
    // Backward-compatible: any error falls through silently.
    try {
      // Unified consult: self-contained HTTP to the Modal orchestrator (the old
      // dynamicRequire of ~/arthur FAILED on the Fly container, so the live
      // dashboard never actually reached the 37 specialists). Same smart gate as
      // the TUI + cloud. Context only — the 29-tool loop below still drives actions.
      const { consultOrchestrator } = await import("@/lib/orchestrator-consult");
      const specCtx = await consultOrchestrator(prompt, { tenant_id: "dabney", session_id: sessionId });
      if (specCtx) {
        systemPrompt += "\n\n" + specCtx;
        if (messages[0]?.role === "system") messages[0].content = systemPrompt;
      }
    } catch { /* orchestrator enrichment is non-fatal — chat proceeds normally */ }
  };

  // 3d. STREAMING PATH (opt-in: body.stream === true, or Accept: text/event-stream)
  //
  // The non-streaming path below returns one NextResponse.json() only after every
  // tool round AND the full generation have finished — so nothing renders for
  // seconds. ChatGPT's speed advantage is time-to-first-token, not total time.
  //
  // Here we hand the client an SSE stream immediately: a status event right away,
  // a tool event per tool round (so the UI shows motion), then the final answer
  // token-by-token. Everything below this block is untouched — a client that does
  // not opt in gets byte-identical behaviour.
  const wantStream =
    (payload as { stream?: boolean } | null)?.stream === true ||
    (req.headers.get("accept") || "").includes("text/event-stream");

  if (wantStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* client gone */ }
        };
        let text = "";
        let provider = "stream";
        try {
          // First byte goes out before ANY dependency is touched, so the UI paints
          // immediately even if Supabase or the orchestrator is slow.
          // First byte goes out before ANY Supabase/network work — buildTurn()
          // (history, location, memory, persona) now runs inside the stream, so
          // time-to-first-byte no longer waits on it.
          mark("streamOpen");
          send({ type: "status", text: "thinking", session_id: sessionId, phases: _phases });

          await buildTurn();
          await runPreWork();

          // Tool rounds run server-side (the answer can't exist before they do),
          // but each one is announced so the UI is never silent.
          const thread: OpenAIMessage[] = [...messages];
          const toolNames: string[] = [];
          for (let round = 0; round < 3; round++) {
            if (!promptNeedsTools(thread)) break;
            const r = await callLLM(thread, true);
            const msg = r?.response?.choices?.[0]?.message;
            const calls = msg?.tool_calls ?? [];
            if (!calls.length) {
              if (msg?.content) { text = msg.content; provider = r?.provider || provider; }
              break;
            }
            thread.push({ role: "assistant", content: msg?.content ?? null, tool_calls: calls });
            for (const tc of calls) {
              const name = tc.function?.name ?? "unknown";
              toolNames.push(name);
              send({ type: "tool", name });
              const out = await executeTool(name, tc.function?.arguments ?? "{}");
              thread.push({ role: "tool", content: out, tool_call_id: tc.id, name });
            }
          }

          // Stream the user-visible answer.
          if (!text) {
            const res = await streamChat(thread as never, (d) => { text += d; send({ type: "delta", text: d }); });
            if (res) provider = res.tier.id;
          } else {
            // The tool loop already produced the final text (model answered without
            // further tool calls). Emit it as a single delta — WITHOUT this the
            // client receives zero deltas, discards the stream, and silently
            // re-runs the whole request on the non-streaming path: double the
            // API cost on every tool-using prompt. Chunkier than token streaming,
            // but it costs nothing extra.
            send({ type: "delta", text });
          }

          // Fallback: streaming ladder produced nothing → non-streaming call, so a
          // streaming client never ends up worse off than a non-streaming one.
          if (!text.trim()) {
            const r = await callLLM(thread, false);
            text = r?.response?.choices?.[0]?.message?.content ?? "";
            provider = r?.provider || provider;
            if (text) send({ type: "delta", text });
          }

          text = sanitizeArthurReply(text, toolNames.length);
          send({
            type: "done",
            session_id: sessionId,
            model: provider,
            model_used: provider,
            tier_used: tierForProvider(provider),
            latency_ms: Date.now() - _requestStart,
            tokens: Math.round(text.length / 4),
            tool_calls: toolNames.length,
            phases: _phases,
            memory_error: memoryError,
            memory_hits: memoryHits,
          });
          console.log(`[chat/phases] ${JSON.stringify(_phases)} firstByte=${_phases.streamOpen ?? "?"} total=${Date.now() - _requestStart}`);
        } catch (e) {
          send({ type: "error", error: e instanceof Error ? e.message : String(e) });
        } finally {
          // Persist off the critical path — the user already has the full reply.
          try { if (text.trim()) await persistMessage(sessionId, "assistant", text, { metadata: { provider, streamed: true } }); } catch { /* non-fatal */ }
          try { controller.close(); } catch { /* already closed */ }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no", // defeat proxy buffering, which would erase the point
      },
    });
  }

  // Non-streaming path: same work, run inline as before.
  await buildTurn();
  await runPreWork();

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

    // Persist tool round to DB
    await persistMessage(sessionId, "tool",
      toolCalls.map(tc => `[${tc.function?.name}] ${tc.function?.arguments?.slice(0, 80)}`).join("\n"),
      {
        tool_calls: toolCalls,
        tool_results: allToolResults.slice(-toolCalls.length),
      }
    );

    // If last round and still in tool loop, synthesize from tool results
    if (round === MAX_ROUNDS - 1) {
      finalContent = allToolResults.map(r => `**${r.name}**:\n${r.result}`).join("\n\n");
    }
  }

  // 4b. Anti-leak post-process — strip text-as-tool-call leaks and "I'm waiting on async results"
  // hallucinations that some models still emit despite the prompt instructions.
  finalContent = sanitizeArthurReply(finalContent, allToolCalls.length);

  // 5. Persist assistant response
  await persistMessage(sessionId, "assistant", finalContent, {
    metadata: { provider: finalProvider, tool_calls_count: allToolCalls.length },
  });

  // 5b. Record employee dispatch (recorder layer of the learning-layer mandate).
  // Best-effort, never blocks the response.
  try {
    const { recordDispatch, inferEmployee } = await import("@/lib/employees/recorder");
    const emp = inferEmployee(prompt || "");
    await recordDispatch({
      team: emp.team,
      employee_id: emp.employee_id,
      task: prompt || "(empty)",
      model_used: finalProvider || "unknown",
      state: "active",
      metadata: { tool_calls: allToolCalls.length, session_id: sessionId },
    });
  } catch { /* recorder is non-critical */ }

  // Track latency for UI telemetry badge
  const latencyMs = Date.now() - _requestStart;

  // Rough token count for the badge (characters / 4 is good enough for display)
  const approxTokens = Math.round(finalContent.length / 4);

  // 6. Return — preserving { response, model, routing } shape the UI expects + new fields
  return NextResponse.json({
    response: finalContent,
    session_id: sessionId,
    model: finalProvider || "unknown",
    model_used: finalProvider || "unknown",
    tier_used: tierForProvider(finalProvider || ""),
    latency_ms: latencyMs,
    tokens: approxTokens,
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
// sanitizeArthurReply is now imported from @/lib/sanitizer (canonical: ~/arthur-core/src/sanitizer.ts)
// The inline function was removed in Sprint 3 (2026-05-07). See lib/sanitizer.ts.

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
