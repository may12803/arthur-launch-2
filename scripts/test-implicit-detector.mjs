/**
 * Smoke test for the pure detectImplicitCorrection function.
 * Run: node /Users/danielmay/Projects/arthur-launch/scripts/test-implicit-detector.mjs
 *
 * This imports the compiled JS via the built .next cache — but since we're running
 * pre-build, we test the logic directly by inlining it so there's no build dependency.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Inline the pure classifier (mirrors lib/training/implicit-correction-detector.ts)
// ──────────────────────────────────────────────────────────────────────────────

const CORRECTION_PHRASES = [
  "no, actually",
  "that's wrong",
  "that is wrong",
  "i meant",
  "actually i",
  "not quite",
  "no that's",
  "try again",
  "do it differently",
  "that didn't work",
  "let's try",
  "don't do that",
  "actually,",
];

const SHORT_WRONG_THRESHOLD = 6;

function detectImplicitCorrection(userTurn) {
  const trimmed = userTurn.trim();
  if (trimmed.endsWith("?")) return { matched: false };
  const lower = trimmed.toLowerCase();
  for (const phrase of CORRECTION_PHRASES) {
    if (lower.includes(phrase)) return { matched: true, phrase };
  }
  if (lower.includes("wrong")) {
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length <= SHORT_WRONG_THRESHOLD) return { matched: true, phrase: "wrong" };
  }
  if (lower.includes("stop")) {
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length <= SHORT_WRONG_THRESHOLD) return { matched: true, phrase: "stop" };
  }
  return { matched: false };
}

// ──────────────────────────────────────────────────────────────────────────────
// Test cases
// ──────────────────────────────────────────────────────────────────────────────

const cases = [
  // { input, expectedMatched, label }
  { input: "no, actually I meant Tuesday",   expectedMatched: true,  label: "correction: 'no, actually'" },
  { input: "what is the weather",            expectedMatched: false, label: "question (no ?) — not a correction" },
  { input: "that didn't work",               expectedMatched: true,  label: "correction: 'that didn't work'" },
  { input: "can you do that again?",         expectedMatched: false, label: "question with ? — excluded" },
  { input: "That's WRONG",                   expectedMatched: true,  label: "short 'wrong' (2 tokens) — matched" },
  { input: "that is wrong",                  expectedMatched: true,  label: "correction: 'that is wrong'" },
  { input: "I meant the other option",       expectedMatched: true,  label: "correction: 'i meant'" },
  { input: "actually, let's do it differently", expectedMatched: true, label: "correction: 'actually,'" },
  { input: "not quite what I was looking for", expectedMatched: true, label: "correction: 'not quite'" },
  { input: "try again with a different approach", expectedMatched: true, label: "correction: 'try again'" },
  { input: "don't do that next time",        expectedMatched: true,  label: "correction: 'don't do that'" },
  { input: "the weather is wrong for this time of year and that is because of climate change", expectedMatched: false, label: "'wrong' in long sentence (>6 tokens) — not matched" },
  { input: "stop",                            expectedMatched: true,  label: "correction: 'stop' alone (1 token)" },
  { input: "please stop sending so many messages to everyone", expectedMatched: false, label: "'stop' in long sentence — not matched" },
  { input: "how do I do that?",              expectedMatched: false, label: "question with ? — excluded" },
  { input: "actually I think you're right",  expectedMatched: true,  label: "correction: 'actually i'" },
  { input: "let's try a different approach", expectedMatched: true,  label: "correction: 'let's try'" },
  { input: "no that's not what I meant",     expectedMatched: true,  label: "correction: 'no that's'" },
  { input: "do it differently please",       expectedMatched: true,  label: "correction: 'do it differently'" },
];

let passed = 0;
let failed = 0;

for (const { input, expectedMatched, label } of cases) {
  const result = detectImplicitCorrection(input);
  const ok = result.matched === expectedMatched;
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}${result.phrase ? ` [phrase="${result.phrase}"]` : ""}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
    console.log(`         input:    "${input}"`);
    console.log(`         expected: matched=${expectedMatched}`);
    console.log(`         got:      matched=${result.matched}, phrase="${result.phrase ?? ""}"`);
  }
}

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
