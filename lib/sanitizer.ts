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
  /(?:\n+|\s+)?(?:Want me to|Should I|Would you like me to|Do you want me to|Shall I|May I)\s+[^?]*\?\s*$/i;

// Pattern 6b: "Let me know if you'd like me to..." / "Just say the word and I'll..." / "Happy to..."
export const TRAILING_OFFER_RE =
  /(?:\n+|\s+)?(?:Let me know if you'?d like me to|Just say the word and I'?ll|Happy to (?:help|do|run|deploy|run that|tackle that)|Feel free to ask|Ping me (?:if|when))\s+[^.!?]*[.!?]?\s*$/i;

// Pattern 6c: Multi-line bulleted offer block — "Would you like me to:\n• X?\n• Y?\n• Z?"
export const TRAILING_OFFER_BLOCK_RE =
  /\n+\s*(?:Would you like me to|Want me to|Should I|Do you want me to|Shall I|Let me know if you'?d like)\s*:?\s*(?:\n[^\n]*[?.!]\s*){1,8}\s*$/i;

// Pattern 6d: Trailing "ready to act" / "standing by" / "at your service" meta-status.
export const TRAILING_READY_RE =
  /(?:\n+|\s+)(?:I(?:'?m| am)\s+(?:ready|standing by|here|available)(?:\s+(?:to|for|when|whenever))?[^.!?\n]*[.!?]?|Ready (?:when|whenever) you (?:are|need)[^.!?\n]*[.!?]?|Standing by[^.!?\n]*[.!?]?|At your service[^.!?\n]*[.!?]?|Just (?:say the word|let me know)[^.!?\n]*[.!?]?|Awaiting (?:your )?(?:input|instructions|command)[^.!?\n]*[.!?]?)\s*$/i;

// Pattern 6e: Trailing bare-bullet list of question-offers (no "Would you like" lead).
export const TRAILING_BULLET_QUESTIONS_RE =
  /\n+(?:[\s]*[•·\-*]\s*[^\n]+\?\s*\n?){2,}\s*$/;

// Pattern 6f: "I'm ready to <verb>..." followed by a question — Cerebras pattern.
export const READY_PLUS_QUESTION_RE =
  /(?:\n+|\s+)I(?:'?m| am)\s+(?:ready|standing by|here|available|happy)(?:\s+(?:to|for|when|whenever))?[^.!?\n]*[.!?]\s+(?:What|Where|Which|How|When|Why|Who|Can|Could|Would|Should|Shall|May|Do|Did|Are|Is|Will|Have|Has)[^?\n]*\?\s*$/i;

// Pattern 6g: Trailing open-ended question back to user.
export const TRAILING_OPEN_QUESTION_RE =
  /(?:\n+|\s+)(?:What (?:would you like|can I (?:help|do for|assist))|What's the move|What's next|How can I (?:help|assist)|Where (?:would you|to))[^?\n]*\?\s*$/i;

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

  for (let i = 0; i < 4; i++) {
    const before = out;
    out = out.replace(READY_PLUS_QUESTION_RE, '');
    out = out.replace(TRAILING_READY_RE, '');
    out = out.replace(TRAILING_OFFER_BLOCK_RE, '');
    out = out.replace(TRAILING_BULLET_QUESTIONS_RE, '');
    out = out.replace(TRAILING_OPEN_QUESTION_RE, '');
    out = out.replace(TRAILING_PERMISSION_ASK_RE, '');
    out = out.replace(TRAILING_OFFER_RE, '');
    out = out.trimEnd();
    if (out === before) break;
  }

  out = out.replace(BOLD_RE, '$1');
  out = out.replace(ITALIC_RE, '$1');
  out = out.replace(UNDERLINE_RE, '$1');

  out = out.replace(/\n{3,}/g, '\n\n').trim();

  if (!out && toolsActuallyUsed === 0) {
    return "I tried to answer that but ended up writing the tool call as text instead of invoking it. Ask again — I'll route through the tool properly this time.";
  }

  return out;
}
