import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import { Nav, Footer } from "@/app/_components/Layout";
import BrainIndex from "./BrainIndex";
import CapabilityManifest from "./CapabilityManifest";
import BrainCanvas from "@/app/_components/BrainCanvas";
import ModelLadder from "./_components/ModelLadder";
import PrinciplesCondensed from "./_components/PrinciplesCondensed";

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
  name:string;
  label: string;
  files: number;
  sizeBytes: number;
  categories: Category[];
}

interface BrainIndexData {
  totals: { files: number; sizeBytes: number };
  roots: Root[];
}

function loadIndex(): BrainIndexData | null {
  try {
    const dataFile = "/data/brain-index.json";
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, "utf8")) as BrainIndexData;
    }
    const file = path.join(process.cwd(), "public", "brain-index.json");
    return JSON.parse(fs.readFileSync(file, "utf8")) as BrainIndexData;
  } catch {
    return null;
  }
}

export default function BrainPage() {
  const data = loadIndex();

  return (
    <>
      <Nav />
      <div className="wrap" style={{ paddingTop: 108 }}>

        {/* ── BrainCanvas hero — glass-panel container ── */}
        <div style={{
          position: "relative",
          height: 480,
          width: "100%",
          overflow: "hidden",
          borderRadius: "var(--radius-panel)",
          background: "var(--glass-t1-bg)",
          border: "1px solid var(--glass-t1-border)",
          backdropFilter: `blur(var(--glass-t1-blur))`,
          boxShadow: "var(--glass-t1-shadow)",
        }}>
          <BrainCanvas source="/brain-graph-full.json" />
          {/* gradient fade */}
          <div style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 200,
            background: "linear-gradient(to bottom, transparent, var(--bg-base))",
            pointerEvents: "none",
          }} />
          {/* overlay label */}
          <div style={{
            position: "absolute",
            top: "var(--space-md, 24px)",
            left: "var(--space-md, 24px)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-sm, 12px)",
          }}>
            <span style={{
              background: "var(--glass-t1-bg)",
              border: "1px solid var(--glass-t1-border)",
              backdropFilter: "blur(12px)",
              borderRadius: "var(--radius-pill)",
              padding: "4px 14px",
              fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
              fontSize: "var(--fs-mono, 12px)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-main)",
            }}>
              knowledge graph · live
            </span>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--tint-emerald)",
              boxShadow: "0 0 8px var(--tint-emerald)",
              display: "inline-block",
            }} />
          </div>
        </div>

        {/* ── Page header ── */}
        <section style={{ paddingTop: "var(--space-lg, 48px)", paddingBottom: "var(--space-xl, 64px)", borderBottom: "none" }}>
          <div className="app-page-top">
            <span className="eyebrow">knowledge corpus</span>
            <h1 className="section-title" style={{ marginTop: 10, marginBottom: 14 }}>the brain.</h1>
            <p className="section-lede">
              {data
                ? `${data.totals.files.toLocaleString()} knowledge files across ${data.roots.length} domains. authored, cross-referenced, and compounding nightly.`
                : "arthur's full knowledge corpus — authored, cross-referenced, and compounding nightly."}
            </p>
          </div>
        </section>

        {/* ── Main content grid ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr 340px',
          gap: 'var(--page-gutter)',
          alignItems: 'flex-start',
        }}>

          {/* ── Left Sidebar: Search + Filter ── */}
          <aside style={{
            position: 'sticky',
            top: 'calc(var(--nav-h, 72px) + 24px)',
            padding: 'var(--space-md, 24px)',
            borderRadius: 'var(--radius-panel)',
            background: 'var(--glass-t1-bg)',
            border: '1px solid var(--glass-t1-border)',
            backdropFilter: `blur(var(--glass-t1-blur))`,
            boxShadow: 'var(--glass-t1-shadow)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-lg, 48px)',
          }}>
            <div>
              <label style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 'var(--fs-mono, 12px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 'var(--space-sm, 12px)' }}>Search Corpus</label>
              <input type="text" placeholder="e.g. 'react server components'" style={{ width: '100%', background: 'var(--bg-mid)', border: '1px solid var(--glass-t1-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', color: 'var(--text-main)', fontFamily: 'var(--font-sans, sans-serif)' }} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 'var(--fs-mono, 12px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 var(--space-md, 24px) 0' }}>Filter by Domain</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs, 8px)' }}>
                {['Engineering', 'Design', 'Strategy', 'Writing', 'Personal'].map(domain => (
                  <label key={domain} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm, 12px)', color: 'var(--text-main)', fontSize: 'var(--fs-small, 14px)' }}>
                    <input type="checkbox" style={{ accentColor: 'var(--accent-orange)' }} />
                    {domain}
                  </label>
                ))}
              </div>
            </div>
          </aside>

          {/* ── Center Column: Main Content ── */}
          <main>
            {/* ── Stats strip ── */}
            {data && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "var(--space-sm, 12px)",
                marginBottom: "var(--space-lg, 48px)",
              }}>
                {[
                  { value: data.totals.files.toLocaleString(), label: "files" },
                  { value: (data.totals.sizeBytes / 1024 / 1024).toFixed(1), label: "MB total" },
                  { value: String(data.roots.length), label: "domains" },
                ].map(({ value, label }) => (
                  <div key={label} style={{
                    background: "var(--glass-t1-bg)",
                    border: "1px solid var(--glass-t1-border)",
                    backdropFilter: `blur(var(--glass-t1-blur))`,
                    borderRadius: "var(--radius-panel)",
                    padding: "var(--space-md, 24px) var(--space-lg, 48px)",
                    textAlign: "center",
                  }}>
                    <div style={{
                      fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                      fontSize: "var(--fs-h1, 3rem)",
                      fontWeight: 700,
                      color: "var(--text-active)",
                      lineHeight: 1,
                      letterSpacing: "-0.04em",
                    }}>{value}</div>
                    <div style={{
                      fontFamily: "var(--font-jetbrains, monospace)",
                      fontSize: "var(--fs-mono, 12px)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      marginTop: "var(--space-xs, 8px)",
                    }}>{label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Brain index ── */}
            {data ? (
              <BrainIndex data={data} />
            ) : (
              <div style={{
                background: "var(--glass-t1-bg)",
                border: "1px solid var(--glass-t1-border)",
                backdropFilter: `blur(var(--glass-t1-blur))`,
                borderRadius: "var(--radius-panel)",
                padding: "var(--space-lg, 48px)",
              }}>
                <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-jetbrains, monospace)", fontSize: "var(--fs-mono, 12px)", margin: 0 }}>
                  brain-index.json not found — run the data generator.
                </p>
              </div>
            )}

            {/* ── Capability manifest ── */}
            <div style={{ marginTop: "var(--space-xl, 64px)" }}>
              <CapabilityManifest />
            </div>

            {/* ── 18-tier model ladder ── */}
            <div style={{
              marginTop: "var(--space-xl, 64px)",
              paddingTop: "var(--space-lg, 48px)",
              borderTop: "1px solid var(--line-separator)",
            }}>
              <span className="eyebrow">18-tier model hierarchy · unified 2026-05-03</span>
              <h2 style={{
                fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
                fontWeight: 700,
                fontSize: "var(--fs-h2, 2.25rem)",
                letterSpacing: "-0.02em",
                margin: "10px 0 6px",
                color: "var(--text-active)",
              }}>
                the routing ladder.
              </h2>
              <p style={{
                fontSize: "var(--fs-small, 14px)",
                color: "var(--text-muted)",
                maxWidth: "64ch",
                lineHeight: 1.65,
                marginBottom: "var(--space-md, 24px)",
              }}>
                Tiers 0–10 are chat-only. Tiers 11–17 are tool-safe. Hover a row to see recent route examples.
              </p>

              <ModelLadder />

              {/* LoRA card */}
              <div style={{
                marginTop: "var(--space-lg, 48px)",
                background: "var(--glass-t1-bg)",
                border: "1px solid var(--glass-t1-border)",
                backdropFilter: `blur(var(--glass-t1-blur))`,
                borderRadius: "var(--radius-panel)",
                padding: "var(--space-md, 24px) var(--space-lg, 48px)",
                boxShadow: "var(--glass-t1-shadow)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm, 12px)", marginBottom: "var(--space-md, 24px)" }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--accent-orange)",
                    boxShadow: "0 0 12px var(--accent-glow)",
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: "var(--font-jetbrains, monospace)",
                    fontSize: "var(--fs-mono, 12px)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--accent-orange)",
                  }}>
                    tier 4 · arthur-tuned lora
                  </span>
                  <span style={{
                    marginLeft: "auto",
                    fontFamily: "var(--font-jetbrains, monospace)",
                    fontSize: "var(--fs-mono, 12px)",
                    color: "var(--tint-emerald)",
                    background: "var(--tint-emerald-soft)",
                    border: "1px solid var(--tint-emerald)",
                    borderRadius: "var(--radius-pill)",
                    padding: "3px 12px",
                  }}>
                    trained 2026-05-03 11:05 AM
                  </span>
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "var(--space-sm, 12px)",
                }}>
                  {[
                    { label: "base model", value: "Qwen2.5-7B-Instruct-4bit" },
                    { label: "adapter", value: "LoRA r8 s20 8L 189it" },
                    { label: "training corpus", value: "92KB / brand voice + default" },
                    { label: "runtime", value: "Ollama localhost:11434" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{
                        fontSize: 9,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        marginBottom: 3,
                      }}>{label}</div>
                      <div style={{
                        fontFamily: "var(--font-jetbrains, monospace)",
                        fontSize: "var(--fs-small, 14px)",
                        color: "var(--text-active)",
                        lineHeight: 1.4,
                      }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <p style={{
                fontSize: 11,
                fontFamily: "var(--font-jetbrains, monospace)",
                color: "var(--text-muted)",
                marginTop: "var(--space-sm, 12px)",
                letterSpacing: "0.04em",
              }}>
                hard rule: tool-call paths must restrict to tiers {"{0, 11–17}"}. tiers 1–10 will fabricate completed actions.
              </p>
            </div>

            {/* ── Cross-domain principles ── */}
            <PrinciplesCondensed />
          </main>

          {/* ── Right Sidebar: Inspector ── */}
          <aside style={{
            position: 'sticky',
            top: 'calc(var(--nav-h, 72px) + 24px)',
            padding: 'var(--space-lg, 48px)',
            borderRadius: 'var(--radius-panel)',
            background: 'var(--glass-t2-bg)',
            border: '1px solid var(--glass-t2-border)',
            backdropFilter: `blur(var(--glass-t2-blur))`,
            boxShadow: 'var(--glass-t2-shadow)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-lg, 48px)',
          }}>
            <div>
              <span className="eyebrow" style={{ color: 'var(--text-muted)' }}>Inspector</span>
              <h3 style={{ color: 'var(--text-active)', fontFamily: 'var(--font-space-grotesk, sans-serif)', fontSize: 'var(--fs-h3, 1.75rem)', letterSpacing: '-0.02em', margin: '8px 0 12px' }}>
                Click a node to inspect
              </h3>
              <p style={{ fontSize: 'var(--fs-small, 14px)', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                Select a node in the graph to view its connected principles, skills, and metadata.
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--line-separator)', paddingTop: 'var(--space-lg, 48px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md, 24px)' }}>
              <div>
                <h4 style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 'var(--fs-mono, 12px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 var(--space-sm, 12px) 0' }}>Linked Principles</h4>
                <div style={{ color: 'var(--text-faint)' }}>None selected</div>
              </div>
              <div>
                <h4 style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 'var(--fs-mono, 12px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 var(--space-sm, 12px) 0' }}>Related Skills</h4>
                <div style={{ color: 'var(--text-faint)' }}>None selected</div>
              </div>
              <div>
                <h4 style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 'var(--fs-mono, 12px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 var(--space-sm, 12px) 0' }}>Last Updated</h4>
                <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', color: 'var(--text-faint)', fontSize: 'var(--fs-small, 14px)' }}>--</div>
              </div>
            </div>
          </aside>

        </div>
      </div>
      <Footer />
    </>
  );
}