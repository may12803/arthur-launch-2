import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import BrainStats from "./BrainStats";
import KnowledgeGraph from "./KnowledgeGraph";
import CategoryGrid from "./CategoryGrid";
import RecentFiles from "./RecentFiles";

// Skip prerender — depends on env-bound Supabase client that may not be set at build
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "the brain · arthur",
  description: "arthur's full knowledge corpus — auto-indexed, cross-referenced, compounding nightly.",
};

interface FileEntry {
  name: string;
  relativePath: string;
  sizeBytes: number;
}

interface Category {
  name: string;
  files: FileEntry[];
}

interface Root {
  name: string;
  label: string;
  files?: number;
  sizeBytes?: number;
  categories: Category[];
}

interface BrainIndexData {
  totals: { files: number; sizeBytes: number };
  generated_at?: string;
  roots: Root[];
}

interface GraphStats {
  nodes: number;
  edges: number;
  hubs: number;
  lobes: number;
}

interface GraphData {
  stats: GraphStats;
  lobes?: Record<string, string>;
}

interface UtilizationData {
  counts: Record<string, number>;
  lastUpdated?: string;
}

function tryReadJson<T>(candidates: string[]): T | null {
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")) as T;
    } catch { /* continue */ }
  }
  return null;
}

function loadIndex(): BrainIndexData | null {
  return tryReadJson<BrainIndexData>([
    "/data/brain-index.json",
    path.join(process.cwd(), "public", "brain-index.json"),
  ]);
}

function loadGraphStats(): GraphStats | null {
  const data = tryReadJson<GraphData>([
    "/data/brain-graph-full.json",
    path.join(process.cwd(), "public", "brain-graph-full.json"),
  ]);
  return data?.stats ?? null;
}

function loadUtilization(): UtilizationData | null {
  return tryReadJson<UtilizationData>([
    "/data/brain-utilization.json",
    path.join(process.cwd(), "public", "brain-utilization.json"),
  ]);
}

export default function BrainPage() {
  const index = loadIndex();
  const graphStats = loadGraphStats();
  const utilization = loadUtilization();

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalFiles = index?.totals.files ?? 597;
  const totalNodes = graphStats?.nodes ?? 437;
  const totalEdges = graphStats?.edges ?? 6293;
  const utilizationPercent = utilization
    ? Math.round((Object.keys(utilization.counts).length / totalFiles) * 100)
    : 32;

  const statCards = [
    { value: totalFiles.toLocaleString(), label: "knowledge files" },
    { value: totalNodes.toLocaleString(), label: "graph nodes" },
    { value: totalEdges.toLocaleString(), label: "authored links" },
    { value: `${utilizationPercent}%`, label: "utilized this week" },
  ];

  // ── Categories ─────────────────────────────────────────────────────────────
  const categories = (index?.roots ?? [])
    .filter((r) => !["external-skills", "unverified"].includes(r.name))
    .map((root) => {
      const allFiles: FileEntry[] = [];
      for (const cat of root.categories ?? []) {
        allFiles.push(...(cat.files ?? []));
      }
      const topFiles = allFiles
        .filter((f) => !f.name.startsWith("README") && !f.name.startsWith("INDEX"))
        .slice(0, 3)
        .map((f) => f.name);
      return { name: root.name, fileCount: allFiles.length, topFiles };
    })
    .filter((c) => c.fileCount > 0)
    .sort((a, b) => b.fileCount - a.fileCount);

  // ── Recent files ───────────────────────────────────────────────────────────
  const recentFiles: { title: string; category: string; timestamp: string | null }[] = [];
  if (index) {
    for (const root of index.roots) {
      if (["external-skills", "unverified"].includes(root.name)) continue;
      for (const cat of root.categories ?? []) {
        for (const file of cat.files ?? []) {
          if (recentFiles.length >= 10) break;
          recentFiles.push({
            title: file.name
              .replace(/\.md$/, "")
              .replace(/-/g, " ")
              .replace(/_/g, " "),
            category: root.name,
            timestamp: index.generated_at ?? null,
          });
        }
        if (recentFiles.length >= 10) break;
      }
      if (recentFiles.length >= 10) break;
    }
  }

  const snapshotTimestamp = index?.generated_at
    ? new Date(index.generated_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Detroit",
      })
    : "—";

  return (
    <div className="wrap" style={{ paddingTop: 108 }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <section style={{ marginBottom: "var(--space-lg, 32px)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <div>
            <span
              style={{
                fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--text-muted, rgba(245,246,248,0.50))",
                display: "block",
                marginBottom: 6,
                fontWeight: 700,
              }}
            >
              knowledge corpus
            </span>
            <h1
              style={{
                fontFamily: "var(--font-lora, 'Lora', Georgia, serif)",
                fontWeight: 500,
                fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
                letterSpacing: "-0.02em",
                color: "var(--text-active)",
                margin: "0 0 6px",
                lineHeight: 1.2,
              }}
            >
              Arthur&apos;s Brain
            </h1>
            <p
              style={{
                fontFamily: "var(--font-inter, Inter, sans-serif)",
                fontSize: 14,
                color: "var(--text-dim)",
                margin: 0,
                maxWidth: "52ch",
                lineHeight: 1.55,
              }}
            >
              the knowledge graph powering every reply
            </p>
          </div>

          {/* Search box */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <span
              style={{
                position: "absolute",
                left: 13,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-dim)",
                fontSize: 14,
                pointerEvents: "none",
              }}
            >
              ⌕
            </span>
            <input
              type="text"
              placeholder="search the brain..."
              style={{
                width: 260,
                padding: "10px 52px 10px 38px",
                background: "var(--glass-bg)",
                border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius-pill, 999px)",
                color: "var(--text-active, var(--text))",
                fontFamily: "var(--font-inter, Inter, sans-serif)",
                fontSize: 13,
                outline: "none",
                backdropFilter: "blur(14px)",
              }}
            />
            <kbd
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                fontSize: 9,
                color: "var(--accent-orange)",
                background: "var(--accent-orange-soft)",
                border: "1px solid var(--accent-orange)",
                borderRadius: 4,
                padding: "2px 5px",
                letterSpacing: "0.02em",
                pointerEvents: "none",
              }}
            >
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Stat cards */}
        <BrainStats stats={statCards} />
      </section>

      {/* ── Knowledge graph ──────────────────────────────────────────────── */}
      <section style={{ marginBottom: "var(--space-lg, 32px)" }}>
        <KnowledgeGraph lastUpdated={index?.generated_at} />
      </section>

      {/* ── Category breakdown ───────────────────────────────────────────── */}
      <section style={{ marginBottom: "var(--space-lg, 32px)" }}>
        <CategoryGrid categories={categories} />
      </section>

      {/* ── Recent additions ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: "var(--space-lg, 32px)" }}>
        <RecentFiles files={recentFiles} />
      </section>

      {/* ── Footer note ──────────────────────────────────────────────────── */}
      <footer
        style={{
          paddingBottom: "var(--space-lg, 32px)",
          paddingTop: "var(--space-md, 20px)",
          borderTop: "1px solid var(--glass-border)",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-inter, Inter, sans-serif)",
            fontSize: 12,
            fontStyle: "italic",
            color: "var(--text-dim)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Brain auto-syncs nightly via the regen pipeline. Last full reindex:{" "}
          <span
            style={{
              fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
              fontStyle: "normal",
              color: "var(--text-active, var(--text))",
            }}
          >
            {snapshotTimestamp}
          </span>
          .
        </p>
      </footer>
    </div>
  );
}
