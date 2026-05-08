// Arthur reply sanitizer — sourced from @arthur/core canonical definition at:
//   ~/arthur-core/src/sanitizer.ts
//
// Next.js cannot import packages outside the project directory, so this file
// is a local mirror. When you update the canonical, update this file too.
// arthur-launch/app/api/chat/route.ts imports sanitizeArthurReply from here.
//
// Enforces CLAUDE.md Rules 7 (no markdown emphasis) and 10 (no trailing permission asks).

// ALL 17 tool names — keep in sync with TOOL_DEFINITIONS in route.ts.
const ALL_TOOL_NAMES = [
  'web_search', 'live_sports_score', 'get_weather', 'query_inbox', 'query_legal',
  'query_brain_graph', 'query_memory', 'list_recent_actions', 'send_email',
  'create_calendar_event', 'query_calendar_events', 'composio_execute',
  'pipedream_workflow', 'scrape_url', 'validate_email', 'convert_currency', 'apilayer',
];

const ALL_TOOL_RE = ALL_TOOL_NAMES.join('|');

// Pattern 1: `[tool_name] {json}` or `[tool_name](json)` — strip the line.
export const FAKE_TOOL_BLOCK_RE = new RegExp(
  `^\\s*\\[(?:${ALL_TOOL_RE})\\]\\s*[{(\\[][^\\n]*[})\\]]\\s*$`,
  'gim',
);

// Pattern 2: bare tool-call syntax mid-text — `web_search('foo')` etc.
export const BARE_TOOL_CALL_RE = new RegExp(
  `\\b(?:${ALL_TOOL_RE})\\s*\\(['"][^'"]*['"]\\)`,
  'g',
);

// Pattern 3: italicized action text mimicking tool invocation.
export const ITALIC_TOOL_ACTION_RE = new RegExp(
  `\\*+\\s*(?:performs?|calling|invoking|running|fetching)\\s+(?:${ALL_TOOL_RE}|the\\s+\\w+\\s+tool)[^*\\n]*\\*+`,
  'gi',
);

// Pattern 4: "Let me check tool_name..."
export const LET_ME_CHECK_RE = new RegExp(
  `^.*\\b(?:Let me|I'?ll|I will)\\s+(?:check|run|invoke|call|use)\\s+(?:${ALL_TOOL_RE}|the\\s+\\w+\\s+tool)\\b[^\\n]*\\n?`,
  'gmi',
);

// Pattern 5: async-pretend phrases ("waiting on the result" etc.)
export const ASYNC_PRETEND_RE =
  /^.*\b(?:I(?:'?m| am)?\s+(?:waiting|need to wait|still waiting)\s+(?:on|for)\s+(?:the\s+)?(?:web\s*search|search|tool)\s+(?:result|call|response)|once\s+(?:that|it|the search|the result)\s+comes? back|i'?ll\s+(?:detail|get back to you)\s+(?:once|when)\s+(?:that|the|it)\s+(?:returns|comes back|finishes))\b[^\n]*\n?/gmi;

// Pattern 6a: trailing permission asks at end-of-message.
export const TRAILING_PERMISSION_ASK_RE =
  /(?:\n+|\s+)?(?:Want me to|Should I|Would you like me to|Do you want me to)\s+[^?]*\?\s*$/i;

// Pattern 6b: "Let me know if you'd like me to..." / "Just say the word and I'll..."
export const TRAILING_OFFER_RE =
  /(?:\n+|\s+)?(?:Let me know if you'?d like me to|Just say the word and I'?ll)\s+[^.!?]*[.!?]?\s*$/i;

// Pattern 7: markdown emphasis markers — strip markers, keep content.
export const BOLD_RE    = /\*\*([^*\n]+?)\*\*/g;           // **bold** → bold
export const ITALIC_RE  = /(?<!\w)\*([^*\n]+?)\*(?!\w)/g;  // *italic* → italic (avoid 5*5)
export const UNDERLINE_RE = /(?<!\w)_([^_\n]+?)_(?!\w)/g;  // _underline_ → underline

/**
 * Sanitize an Arthur reply before delivery.
 *
 * @param text              - Raw LLM output string.
 * @param toolsActuallyUsed - Number of tool calls that actually fired this turn.
 *                            Pass 0 when no tools were available/called.
 */
export function sanitizeArthurReply(text: string, toolsActuallyUsed = 0): string {
  if (!text) return text;
  let out = text;

  out = out.replace(FAKE_TOOL_BLOCK_RE, '');
  out = out.replace(BARE_TOOL_CALL_RE, '');
  out = out.replace(ITALIC_TOOL_ACTION_RE, '');
  out = out.replace(LET_ME_CHECK_RE, '');

  if (toolsActuallyUsed === 0) {
    out = out.replace(ASYNC_PRETEND_RE, '');
  }

  out = out.replace(TRAILING_PERMISSION_ASK_RE, '');
  out = out.replace(TRAILING_OFFER_RE, '');

  out = out.replace(BOLD_RE, '$1');
  out = out.replace(ITALIC_RE, '$1');
  out = out.replace(UNDERLINE_RE, '$1');

  out = out.replace(/\n{3,}/g, '\n\n').trim();

  if (!out && toolsActuallyUsed === 0) {
    return "I tried to answer that but ended up writing the tool call as text instead of invoking it. Ask again — I'll route through the tool properly this time.";
  }

  return out;
}
