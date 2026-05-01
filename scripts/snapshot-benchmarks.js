#!/usr/bin/env node
/**
 * snapshot-benchmarks.js
 * Reads local Arthur data and produces public/benchmarks.json for the Next.js build.
 * Run: node scripts/snapshot-benchmarks.js
 */

import fs from "fs";
import path from "path";
import os from "os";

const HOME = os.homedir();
const OUT = path.join(process.cwd(), "public", "benchmarks.json");

// ─── Helpers ───────────────────────────────────────────────────────────────

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readJSONL(filePath) {
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function mtimeMs(filePath) {
  try { return fs.statSync(filePath).mtimeMs; } catch { return 0; }
}

// ─── GAIA ──────────────────────────────────────────────────────────────────

function parseGaia() {
  const benchDir = path.join(HOME, ".arthur", "data", "benchmarks");
  let gaiaFiles = [];
  try {
    gaiaFiles = fs
      .readdirSync(benchDir)
      .filter((f) => f.startsWith("gaia-") && f.endsWith(".json") && f !== "gaia-publicset.json")
      .map((f) => ({
        file: path.join(benchDir, f),
        mtime: mtimeMs(path.join(benchDir, f)),
      }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {}

  if (gaiaFiles.length === 0) return null;

  const history = gaiaFiles
    .map(({ file }) => {
      const d = readJSON(file);
      if (!d || !d.summary) return null;
      const s = d.summary;
      return {
        score: s.accuracy,
        total: s.total,
        passed: s.correct,
        failed: s.total - s.correct,
        ranAt: s.completedAt || s.startedAt || null,
        byLevel: s.byLevel || null,
      };
    })
    .filter(Boolean);

  // Public set for total task count + difficulty distribution
  const publicSet = readJSON(path.join(benchDir, "gaia-publicset.json"));
  const publicSetCount = Array.isArray(publicSet) ? publicSet.length : 0;

  const latest = history[0] || null;
  const status = latest ? (Date.now() - new Date(latest.ranAt).getTime() > 7 * 86400000 ? "stale" : "measured") : "missing";

  return {
    id: "gaia",
    name: "GAIA",
    kind: "external",
    description:
      "General AI Assistants benchmark (Mialon et al., Meta + HuggingFace). Tests multi-step reasoning with tools across real-world tasks.",
    publicSetTotal: publicSetCount,
    latest,
    history: history.slice(1).map((h) => ({ score: h.score, ranAt: h.ranAt })),
    status,
    gapNote:
      publicSetCount > 0 && latest
        ? `Running on a ${latest.total}-item local probe. Full public set has ${publicSetCount} tasks across levels 1-3.`
        : null,
  };
}

// ─── SWE-bench ─────────────────────────────────────────────────────────────

function parseSWEBench() {
  const filePath = path.join(HOME, ".arthur", "data", "swe-bench-results.jsonl");
  const records = readJSONL(filePath);
  if (records.length === 0) return null;

  // All records are scaffolded (passed: null) — note that truthfully
  const attempted = records.length;
  const passed = records.filter((r) => r.passed === true).length;
  const scaffolded = records.filter((r) => r.passed === null).length;
  const latest = records[records.length - 1];

  return {
    id: "swe-bench",
    name: "SWE-bench",
    kind: "external",
    description:
      "Software engineering benchmark — real GitHub issues requiring code changes to pass test suites. Industry standard at 300 verified instances.",
    latest:
      scaffolded === attempted
        ? null
        : {
            score: passed / attempted,
            total: attempted,
            passed,
            failed: attempted - passed,
            ranAt: latest.t || null,
          },
    history: [],
    status: scaffolded === attempted ? "missing" : "measured",
    gapNote:
      scaffolded === attempted
        ? `${attempted} instances scaffolded but flagged as "requires SWE-bench docker harness" — no real eval runs yet. Wire ~/arthur/agentic/webarena-runner.js pattern against the swebench-docker container to produce real pass/fail.`
        : null,
  };
}

// ─── Xero scorecard (internal) ─────────────────────────────────────────────

function parseXeroScorecard() {
  const filePath = path.join(HOME, "arthur", "benchmarks", "xero-expertise-scorecard.json");
  const d = readJSON(filePath);
  if (!d) return null;

  const items = d.items || [];
  const total = items.length;
  const builtAt = d.built_at ? new Date(d.built_at).toISOString() : null;

  return {
    id: "xero-scorecard",
    name: "Xero Expertise Scorecard",
    kind: "internal",
    description:
      "100-item internal benchmark across 6 Xero capability buckets: API, accounting, UI, edge cases, migration, and reporting. Expert threshold: 90%.",
    latest: total > 0 ? { total, ranAt: builtAt } : null,
    history: [],
    status: total > 0 ? "measured" : "missing",
    buckets: d.buckets || null,
    gapNote:
      total > 0
        ? `Scorecard constructed (${total} items across ${Object.keys(d.buckets || {}).length} buckets). Automated scoring run not yet wired — items are reference questions. Run \`node ~/arthur/benchmarks/score-xero.js\` to generate accuracy numbers.`
        : null,
  };
}

// ─── Bench runner log ──────────────────────────────────────────────────────

function parseBenchRunner() {
  const filePath = path.join(HOME, ".arthur", "data", "bench-runner.jsonl");
  const records = readJSONL(filePath);
  return {
    totalRuns: records.length,
    lastRun: records.length > 0 ? records[records.length - 1].ts || null : null,
    sampleResults: records.length > 0 ? records[records.length - 1].results || [] : [],
  };
}

// ─── Run directory ─────────────────────────────────────────────────────────

function countRuns() {
  const runsDir = path.join(HOME, ".arthur", "data", "runs");
  try {
    const entries = fs.readdirSync(runsDir);
    const byDate = {};
    entries.forEach((e) => {
      const date = e.slice(0, 10); // "2026-04-19"
      byDate[date] = (byDate[date] || 0) + 1;
    });
    return { total: entries.length, byDate };
  } catch {
    return { total: 0, byDate: {} };
  }
}

// ─── Gap-fill plans ────────────────────────────────────────────────────────

function parseGapFillPlans() {
  const metaDir = path.join(HOME, "arthur", "knowledge", "meta");
  let files = [];
  try {
    files = fs
      .readdirSync(metaDir)
      .filter((f) => f.startsWith("gap-fill-") && f.endsWith(".md"))
      .sort();
  } catch {
    return [];
  }

  return files.map((fname) => {
    const filePath = path.join(metaDir, fname);
    const raw = fs.readFileSync(filePath, "utf8");

    // Strip frontmatter
    const stripped = raw.replace(/^---[\s\S]*?---\n/, "").trim();

    // Extract timestamp from filename: gap-fill-<ts>.md
    const tsMatch = fname.match(/gap-fill-(\d+)\.md/);
    const ts = tsMatch ? parseInt(tsMatch[1], 10) : null;
    const fileDate = ts ? new Date(ts).toISOString() : null;

    // Extract Task: line
    const taskMatch = stripped.match(/^Task:\s*(.+)$/m);
    const task = taskMatch ? taskMatch[1].trim() : "(unknown task)";

    // Extract Generated: line
    const genMatch = stripped.match(/^Generated:\s*(.+)$/m);
    const generatedAt = genMatch ? genMatch[1].trim() : fileDate;

    // Extract body — skip the H1 and meta lines, capture from first ## heading
    const bodyMatch = stripped.match(/(?:^## [\s\S]+)/m);
    const body = bodyMatch ? bodyMatch[0] : stripped;
    const preview = body.slice(0, 600).trim() + (body.length > 600 ? "…" : "");

    return {
      file: fname,
      task,
      generatedAt,
      preview,
      status: "open",
    };
  });
}

// ─── Pending upgrades ──────────────────────────────────────────────────────

function parsePendingUpgrades() {
  const filePath = path.join(HOME, "arthur", "knowledge", "meta", "pending-upgrades.md");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    // Count ## headings (skip "How to activate" and "Related" meta sections)
    const headings = raw
      .split("\n")
      .filter((l) => l.startsWith("## "))
      .map((l) => l.replace(/^## /, "").trim())
      .filter(
        (h) =>
          !h.startsWith("How to") &&
          !h.startsWith("Related") &&
          !h.startsWith("---")
      );

    // Extract first line from the intro for count
    const countMatch = raw.match(/Unique gaps:\s*(\d+)/);
    const uniqueGaps = countMatch ? parseInt(countMatch[1], 10) : headings.length;

    return {
      count: uniqueGaps,
      titles: headings.slice(0, 40), // cap at 40 for JSON size
      totalHeadings: headings.length,
    };
  } catch {
    return { count: 0, titles: [], totalHeadings: 0 };
  }
}

// ─── HumanEval ─────────────────────────────────────────────────────────────

function parseHumanEval() {
  const benchDir = path.join(HOME, ".arthur", "data", "benchmarks");
  let heFiles = [];
  try {
    heFiles = fs
      .readdirSync(benchDir)
      .filter(
        (f) =>
          f.startsWith("humaneval-") &&
          f.endsWith(".json") &&
          f !== "humaneval-dataset.jsonl"
      )
      .map((f) => ({
        file: path.join(benchDir, f),
        mtime: mtimeMs(path.join(benchDir, f)),
      }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {}

  if (heFiles.length === 0) return null;

  const history = heFiles
    .map(({ file }) => {
      const d = readJSON(file);
      if (!d || typeof d.passAt1 !== "number") return null;
      return {
        score: d.passAt1,
        total: d.total,
        passed: d.passed,
        failed: d.failed,
        errored: d.errored || 0,
        model: d.model,
        ranAt: d.ranAt || null,
      };
    })
    .filter(Boolean);

  if (history.length === 0) return null;

  const latest = history[0];
  const status =
    Date.now() - new Date(latest.ranAt).getTime() > 7 * 86400000
      ? "stale"
      : "measured";

  return {
    id: "humaneval",
    name: "HumanEval",
    kind: "external",
    description:
      "OpenAI's 164-problem Python coding benchmark. Tests functional code generation from docstrings.",
    latest: {
      score: latest.score,
      of: latest.total,
      passed: latest.passed,
      failed: latest.failed,
      model: latest.model,
      ranAt: latest.ranAt,
    },
    history: history
      .slice(1)
      .map((h) => ({ score: h.score, ranAt: h.ranAt })),
    status,
    gapNote: null,
  };
}

// ─── New benchmark parsers (Apr 28 sweep) ─────────────────────────────────

function findLatest(prefix) {
  const benchDir = path.join(HOME, ".arthur", "data", "benchmarks");
  try {
    const files = fs.readdirSync(benchDir)
      .filter(f => f.startsWith(prefix) && f.endsWith(".json"))
      .map(f => ({ file: path.join(benchDir, f), mtime: mtimeMs(path.join(benchDir, f)) }))
      .sort((a, b) => b.mtime - a.mtime);
    return files[0] ? readJSON(files[0].file) : null;
  } catch { return null; }
}

function parseWebArena() {
  const d = findLatest("webarena-");
  if (!d) return null;
  // Treat tiny smoke runs (<3 tasks) as blocked rather than measured
  const blocked = d.status === "blocked" || d.total < 3;
  return {
    id: "webarena", name: "WebArena", kind: "external",
    description: "Multi-tab web agent benchmark — 812 tasks requiring real browser navigation across shopping, CMS, GitLab, and maps.",
    latest: blocked ? null : { score: d.passAt1, of: d.total, passed: d.passed, failed: d.failed, model: d.model, ranAt: d.ranAt },
    history: [],
    status: blocked ? "blocked" : "measured",
    gapNote: blocked
      ? `Tried ${d.total || 0} of 812 tasks (passed ${d.passed || 0}). Running live-web proxy eval with isolated Chrome on port 9223. Stand up WebArena Docker stack (5 containers, ~50GB) for reproducible scores comparable to published Operator/CUA 58.1%.`
      : `Ran ${d.total} tasks (live-web proxy, isolated Chrome). ${d.subset || ""}`.trim(),
  };
}

function parseSWEBenchSmoke() {
  const d = findLatest("swebench-smoke-");
  if (!d) return null;
  return {
    id: "swe-bench", name: "SWE-bench", kind: "external",
    description: "Software engineering benchmark — real GitHub issues requiring code changes to pass test suites. Industry standard at 300 verified instances.",
    latest: { score: d.passAt1, of: d.total, passed: d.passed, failed: d.failed, model: d.model, ranAt: d.ranAt, kind: "smoke-proxy" },
    history: [],
    status: "smoke",
    gapNote: d.note || "Smoke proxy: scored model diffs against gold patch by file/line overlap (Jaccard ≥ 0.5 = pass). Not a real SWE-bench eval — that requires Docker harness execution against the test suite. ~50GB disk + 10–25hr full run to close the gap.",
  };
}

function parseXeroScorecardRun() {
  const d = findLatest("xero-scorecard-");
  if (!d) return null;
  return {
    id: "xero-scorecard", name: "Xero Expertise Scorecard", kind: "internal",
    description: "100-item internal benchmark across 6 Xero capability buckets: API, accounting, UI, edge cases, migration, and reporting. Expert threshold: 90%.",
    latest: { score: d.passAt1, of: d.total, passed: d.passed, failed: d.total - d.passed, model: d.model, ranAt: d.ranAt, perBucket: d.perBucket || null, passedExpertBar: d.passedExpertBar },
    history: [],
    status: "measured",
    gapNote: d.passedExpertBar ? `Passed expert bar (${(d.passAt1 * 100).toFixed(0)}% ≥ 90%). Per-bucket details available.` : `Scored ${(d.passAt1 * 100).toFixed(0)}% — below expert threshold (90%). Lowest bucket: ${Object.entries(d.perBucket || {}).sort((a, b) => (a[1].pct || 0) - (b[1].pct || 0))[0]?.[0] || "n/a"}.`,
  };
}

function parseAgentBench() {
  // Prefer real-result files (agentbench-*) over status-only stubs (agentbench-status-*)
  const result = findLatest("agentbench-");
  if (result && typeof result.passAt1 === "number") {
    return {
      id: "agentbench", name: "AgentBench (Multi-turn)", kind: "external",
      description: "Multi-turn agent benchmark across OS, DB, knowledge graph, digital card game, lateral thinking puzzles, web shopping, and web browsing.",
      latest: { score: result.passAt1, of: result.total, passed: result.passed, failed: result.failed, model: result.model, ranAt: result.ranAt, category: result.category || "LTP" },
      history: [],
      status: "measured",
      gapNote: result.notes || `Ran ${result.category || "LTP"} subtask. Other 6 categories (OS/DB/KG/HH/WB/CG) still need their per-task containers; biggest blockers are KG (100GB Freebase) and WS (16GB RAM).`,
    };
  }
  const d = findLatest("agentbench-status-");
  if (!d) return null;
  return {
    id: "agentbench", name: "AgentBench (Multi-turn)", kind: "external",
    description: "Multi-turn agent benchmark across OS, DB, knowledge graph, digital card game, lateral thinking puzzles, web shopping, and web browsing.",
    latest: null,
    history: [],
    status: "blocked",
    gapNote: d.blocker || "No harness wired. Setup: clone THUDM/AgentBench, docker-compose up per-subtask environments, wire Arthur's tool-use loop. Estimated 16hr setup. Use HumanEval (95.1%) and MMLU as axis proxies in the meantime.",
  };
}

function parseMMLU() {
  // Prefer the cleanest run: latest file with errored/total < 0.10 (filter rate-limit casualties)
  const benchDir = path.join(HOME, ".arthur", "data", "benchmarks");
  let files = [];
  try {
    files = fs.readdirSync(benchDir)
      .filter(f => f.startsWith("mmlu-") && f.endsWith(".json"))
      .map(f => ({ file: path.join(benchDir, f), data: readJSON(path.join(benchDir, f)) }))
      .filter(({ data }) => data && typeof data.passAt1 === "number");
  } catch {}
  const clean = files
    .filter(({ data }) => data.total > 0 && (data.errored || 0) / data.total < 0.10)
    .sort((a, b) => (b.data.total - (b.data.errored || 0)) - (a.data.total - (a.data.errored || 0)));
  const d = clean[0]?.data;
  if (!d) return null;
  const isSmoke = d.total < 200;
  return {
    id: "mmlu", name: "MMLU", kind: "external",
    description: "Massive Multitask Language Understanding — 57 subjects, ~14,000 multiple-choice questions. Tests breadth of world knowledge.",
    latest: { score: d.passAt1, of: d.total, passed: d.passed, failed: d.failed, model: d.model, ranAt: d.ranAt, kind: isSmoke ? "smoke" : "sample" },
    history: [],
    status: isSmoke ? "smoke" : "measured",
    gapNote: isSmoke
      ? `${d.total}-question smoke (${d.passed}/${d.total} passed). Full 1000-sample runs hit cascading Groq + Haiku rate limits — close the gap by spreading runs across days or using local Gemma for the bulk.`
      : `${d.total}-question stratified sample across 57 subjects.`,
  };
}

// ─── Assemble ──────────────────────────────────────────────────────────────

function build() {
  console.log("Reading data sources...");

  const gaia = parseGaia();
  const humanEval = parseHumanEval();
  // Apr 28 sweep: prefer fresh run files over the static stubs
  const sweBenchSmoke = parseSWEBenchSmoke();
  const sweBench = sweBenchSmoke || parseSWEBench();
  const xeroRun = parseXeroScorecardRun();
  const xeroScorecard = xeroRun || parseXeroScorecard();
  const webarena = parseWebArena();
  const agentbench = parseAgentBench();
  const mmlu = parseMMLU();
  const benchRunner = parseBenchRunner();
  const runs = countRuns();
  const gapFillPlans = parseGapFillPlans();
  const pendingUpgrades = parsePendingUpgrades();

  const allBenchmarks = [gaia, sweBench, xeroScorecard, humanEval, webarena, agentbench, mmlu].filter(Boolean);

  const measured = allBenchmarks.filter((b) => b.status === "measured").length;
  const missing = allBenchmarks.filter((b) => b.status === "missing").length;
  const stale = allBenchmarks.filter((b) => b.status === "stale").length;
  const smoke = allBenchmarks.filter((b) => b.status === "smoke").length;
  const blocked = allBenchmarks.filter((b) => b.status === "blocked").length;

  const out = {
    benchmarks: allBenchmarks,
    gapFillPlans,
    pendingUpgrades,
    benchRunner: {
      totalRuns: benchRunner.totalRuns,
      lastRun: benchRunner.lastRun,
      sampleResults: benchRunner.sampleResults,
    },
    totalRuns: runs.total,
    runsByDate: runs.byDate,
    stats: {
      measured,
      missing,
      stale,
      smoke,
      blocked,
      gapFillCount: gapFillPlans.length,
    },
    lastUpdated: new Date().toISOString(),
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`✓ Wrote ${OUT}`);
  console.log(`  Benchmarks: ${measured} measured, ${smoke} smoke, ${blocked} blocked, ${stale} stale, ${missing} missing`);
  console.log(`  Gap-fill plans: ${gapFillPlans.length}`);
  console.log(`  Pending upgrades: ${pendingUpgrades.count}`);
  console.log(`  Total runs tracked: ${runs.total}`);
  console.log(`  Bench-runner log entries: ${benchRunner.totalRuns}`);
}

build();
