import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import { Nav, Footer } from "../_components/Layout";
import BrainIndex from "./BrainIndex";
import CapabilityManifest from "./CapabilityManifest";
import BrainCanvas from "../_components/BrainCanvas";
import ModelLadder from "./_components/ModelLadder";
import PrinciplesCondensed from "./_components/PrinciplesCondensed";
import GlassPanel from "../_components/GlassPanel";
import TokenChip from "../_components/TokenChip";

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
        <GlassPanel style={{
          position: "relative",
          height: 480,
          width: "100%",
          overflow: "hidden",
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
            top: "var(--space-6)",
            left: "var(--space-6)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
          }}>
            <span style={{
              background: "var(--glass-t1-bg)",
              border: "1px solid var(--glass-t1-border)",
              backdropFilter: "blur(12px)",
              borderRadius: "var(--radius-pill)",
              padding: "4px 14px",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-mono)",
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
        </GlassPanel>

        {/* ── Page header ── */}
        <section style={{ paddingTop: "var(--space-9)", paddingBottom: "var(--space-10)", borderBottom: "none" }}>
          <div className="app-page-top">
            <span className="eyebrow">knowledge corpus</span>
            <h1 className="section-title" style={{ marginTop: "var(--space-2)", marginBottom: "var(--space-3)" }}>the brain.</h1>
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
          <GlassPanel as="aside" style={{
            position: 'sticky',
            top: 'calc(var(--nav-h, 72px) + var(--space-6))',
            padding: 'var(--space-6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-9)',
          }}>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 'var(--space-3)' }}>Search Corpus</label>
              <input type="text" placeholder="e.g. 'react server components'" style={{ width: '100%', background: 'var(--bg-mid)', border: '1px solid var(--glass-t1-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', color: 'var(--text-main)', fontFamily: 'var(--font-body)' }} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 var(--space-6) 0' }}>Filter by Domain</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {['Engineering', 'Design', 'Strategy', 'Writing', 'Personal'].map(domain => (
                  <label key={domain} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--text-main)', fontSize: 'var(--fs-small)' }}>
                    <input type="checkbox" style={{ accentColor: 'var(--accent-orange)' }} />
                    {domain}
                  </label>
                ))}
              </div>
            </div>
          </GlassPanel>

          {/* ── Center Column: Main Content ── */}
          <main>
            {/* ── Stats strip ── */}
            {data && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "var(--space-3)",
                marginBottom: "var(--space-9)",
              }}>
                {[
                  { value: data.totals.files.toLocaleString(), label: "files" },
                  { value: (data.totals.sizeBytes / 1024 / 1024).toFixed(1), label: "MB total" },
                  { value: String(data.roots.length), label: "domains" },
                ].map(({ value, label }) => (
                  <GlassPanel key={label} style={{
                    padding: "var(--space-6) var(--space-9)",
                    textAlign: "center",
                  }}>
                    <div style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-h1)",
                      fontWeight: 700,
                      color: "var(--text-active)",
                      lineHeight: 1,
                      letterSpacing: "-0.04em",
                    }}>{value}</div>
                    <div style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-mono)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      marginTop: "var(--space-2)",
                    }}>{label}</div>
                  </GlassPanel>
                ))}
              </div>
            )}

            {/* ── Brain index ── */}
            {data ? (
              <BrainIndex data={data} />
            ) : (
              <GlassPanel style={{ padding: "var(--space-9)" }}>
                <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono)", margin: 0 }}>
                  brain-index.json not found — run the data generator.
                </p>
              </GlassPanel>
            )}

            {/* ── Capability manifest ── */}
            <div style={{ marginTop: "var(--space-10)" }}>
              <CapabilityManifest />
            </div>

            {/* ── 18-tier model ladder ── */}
            <div style={{
              marginTop: "var(--space-10)",
              paddingTop: "var(--space-9)",
              borderTop: "1px solid var(--line-separator)",
            }}>
              <span className="eyebrow">18-tier model hierarchy · unified 2026-05-03</span>
              <h2 style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "var(--fs-h2)",
                letterSpacing: "-0.02em",
                margin: "var(--space-2) 0 var(--space-1)",
                color: "var(--text-active)",
              }}>
                the routing ladder.
              </h2>
              <p style={{
                fontSize: "var(--fs-small)",
                color: "var(--text-muted)",
                maxWidth: "64ch",
                lineHeight: 1.65,
                marginBottom: "var(--space-6)",
              }}>
                Tiers 0–10 are chat-only. Tiers 11–17 are tool-safe. Hover a row to see recent route examples.
              </p>

              <ModelLadder />

              {/* LoRA card */}
              <GlassPanel style={{
                marginTop: "var(--space-9)",
                padding: "var(--space-6) var(--space-9)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-6)" }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--accent-orange)",
                    boxShadow: "0 0 12px var(--accent-glow)",
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--fs-mono)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--accent-orange)",
                  }}>
                    tier 4 · arthur-tuned lora
                  </span>
                  <TokenChip
                    label="trained 2026-05-03 11:05 AM"
                    color="active"
                    size="sm"
                    style={{ marginLeft: "auto" }}
                  />
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "var(--space-3)",
                }}>
                  {[
                    { label: "base model", value: "Qwen2.5-7B-Instruct-4bit" },
                    { label: "adapter", value: "LoRA r8 s20 8L 189it" },
                    { label: "training corpus", value: "92KB / brand voice + default" },
                    { label: "runtime", value: "Ollama localhost:11434" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{
                        fontSize: "var(--fs-mono)",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        marginBottom: "var(--space-1)",
                      }}>{label}</div>
                      <div style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "var(--fs-small)",
                        color: "var(--text-active)",
                        lineHeight: 1.4,
                      }}>{value}</div>
                    </div>
                  ))}
                </div>
              </GlassPanel>

              <p style={{
                fontSize: "var(--fs-mono)",
                fontFamily: "var(--font-mono)",
                color: "var(--text-muted)",
                marginTop: "var(--space-3)",
                letterSpacing: "0.04em",
              }}>
                hard rule: tool-call paths must restrict to tiers {"{0, 11–17}"}. tiers 1–10 will fabricate completed actions.
              </p>
            </div>

            {/* ── Cross-domain principles ── */}
            <PrinciplesCondensed />
          </main>

          {/* ── Right Sidebar: Inspector ── */}
          <GlassPanel tier={2} as="aside" style={{
            position: 'sticky',
            top: 'calc(var(--nav-h, 72px) + var(--space-6))',
            padding: 'var(--space-9)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-9)',
          }}>
            <div>
              <span className="eyebrow" style={{ color: 'var(--text-muted)' }}>Inspector</span>
              <h3 style={{ color: 'var(--text-active)', fontFamily: 'var(--font-display)', fontSize: 'var(--fs-h3)', letterSpacing: '-0.02em', margin: 'var(--space-2) 0 var(--space-3)' }}>
                Click a node to inspect
              </h3>
              <p style={{ fontSize: 'var(--fs-small)', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                Select a node in the graph to view its connected principles, skills, and metadata.
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--line-separator)', paddingTop: 'var(--space-9)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              <div>
                <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 var(--space-3) 0' }}>Linked Principles</h4>
                <div style={{ color: 'var(--text-faint)' }}>None selected</div>
              </div>
              <div>
                <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 var(--space-3) 0' }}>Related Skills</h4>
                <div style={{ color: 'var(--text-faint)' }}>None selected</div>
              </div>
              <div>
                <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 var(--space-3) 0' }}>Last Updated</h4>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-faint)', fontSize: 'var(--fs-small)' }}>--</div>
              </div>
            </div>
          </GlassPanel>

        </div>
      </div>
      <Footer />
    </>
  );
}
