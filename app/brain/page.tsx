import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import { Nav, Footer } from "../_components/Layout";
import BrainIndex from "./BrainIndex";
import CapabilityManifest from "./CapabilityManifest";
import BrainCanvas from "../_components/BrainCanvas";
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
  name: string;
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
          marginBottom: 0,
          overflow: "hidden",
          borderRadius: "var(--radius-panel)",
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          backdropFilter: "blur(var(--blur-amount))",
          boxShadow: "var(--glass-shadow)",
          marginTop: 0,
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
            top: "var(--space-md)",
            left: "var(--space-md)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-sm)",
          }}>
            <span style={{
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
              backdropFilter: "blur(12px)",
              borderRadius: "var(--radius-pill)",
              padding: "4px 14px",
              fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
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
              background: "#4ade80",
              boxShadow: "0 0 8px rgba(74,222,128,0.7)",
              display: "inline-block",
            }} />
          </div>
        </div>

        {/* ── Page header ── */}
        <section style={{ paddingTop: "var(--space-lg)", paddingBottom: "var(--space-xl)", borderBottom: "none" }}>
          <div className="app-page-top">
            <span className="eyebrow">knowledge corpus</span>
            <h1 className="section-title" style={{ marginTop: 10, marginBottom: 14 }}>the brain.</h1>
            <p className="section-lede">
              {data
                ? `${data.totals.files.toLocaleString()} knowledge files across ${data.roots.length} domains. authored, cross-referenced, and compounding nightly.`
                : "arthur's full knowledge corpus — authored, cross-referenced, and compounding nightly."}
            </p>
          </div>

          {/* ── Stats strip ── */}
          {data && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "var(--space-sm)",
              marginBottom: "var(--space-lg)",
            }}>
              {[
                { value: data.totals.files.toLocaleString(), label: "files" },
                { value: (data.totals.sizeBytes / 1024 / 1024).toFixed(1), label: "MB total" },
                { value: String(data.roots.length), label: "domains" },
              ].map(({ value, label }) => (
                <div key={label} style={{
                  background: "var(--glass-bg)",
                  border: "1px solid var(--glass-border)",
                  backdropFilter: "blur(var(--blur-amount))",
                  borderRadius: "var(--radius-panel)",
                  padding: "var(--space-md) var(--space-lg)",
                  textAlign: "center",
                }}>
                  <div style={{
                    fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                    fontSize: "var(--fs-h1)",
                    fontWeight: 700,
                    color: "var(--text-active)",
                    lineHeight: 1,
                    letterSpacing: "-0.04em",
                  }}>{value}</div>
                  <div style={{
                    fontFamily: "var(--font-jetbrains, monospace)",
                    fontSize: "var(--fs-mono)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    marginTop: "var(--space-xs)",
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
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
              backdropFilter: "blur(var(--blur-amount))",
              borderRadius: "var(--radius-panel)",
              padding: "var(--space-lg)",
            }}>
              <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-jetbrains, monospace)", fontSize: "var(--fs-mono)", margin: 0 }}>
                brain-index.json not found — run the data generator.
              </p>
            </div>
          )}

          {/* ── Capability manifest ── */}
          <div style={{ marginTop: "var(--space-xl)" }}>
            <CapabilityManifest />
          </div>

          {/* ── 18-tier model ladder ── */}
          <div style={{
            marginTop: "var(--space-xl)",
            paddingTop: "var(--space-lg)",
            borderTop: "1px solid var(--glass-border)",
          }}>
            <span className="eyebrow">18-tier model hierarchy · unified 2026-05-03</span>
            <h2 style={{
              fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
              fontWeight: 700,
              fontSize: "var(--fs-h2)",
              letterSpacing: "-0.02em",
              margin: "10px 0 6px",
              color: "var(--text-active)",
            }}>
              the routing ladder.
            </h2>
            <p style={{
              fontSize: "var(--fs-small)",
              color: "var(--text-muted)",
              maxWidth: "64ch",
              lineHeight: 1.65,
              marginBottom: "var(--space-md)",
            }}>
              Tiers 0–10 are chat-only. Tiers 11–17 are tool-safe. Hover a row to see recent route examples.
            </p>

            <ModelLadder />

            {/* LoRA card */}
            <div style={{
              marginTop: "var(--space-lg)",
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
              backdropFilter: "blur(var(--blur-amount))",
              borderRadius: "var(--radius-panel)",
              padding: "var(--space-md) var(--space-lg)",
              boxShadow: "var(--glass-shadow)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--accent-orange)",
                  boxShadow: "0 0 12px var(--accent-orange)",
                  flexShrink: 0,
                }} />
                <span style={{
                  fontFamily: "var(--font-jetbrains, monospace)",
                  fontSize: "var(--fs-mono)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--accent-orange)",
                }}>
                  tier 4 · arthur-tuned lora
                </span>
                <span style={{
                  marginLeft: "auto",
                  fontFamily: "var(--font-jetbrains, monospace)",
                  fontSize: "var(--fs-mono)",
                  color: "#4ade80",
                  background: "rgba(74,222,128,0.08)",
                  border: "1px solid rgba(74,222,128,0.25)",
                  borderRadius: "var(--radius-pill)",
                  padding: "3px 12px",
                }}>
                  trained 2026-05-03 11:05 AM
                </span>
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "var(--space-sm)",
              }}>
                {[
                  { label: "base model",      value: "Qwen2.5-7B-Instruct-4bit" },
                  { label: "adapter",         value: "LoRA r8 s20 8L 189it" },
                  { label: "training corpus", value: "92KB / brand voice + default" },
                  { label: "runtime",         value: "Ollama localhost:11434" },
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
                      fontSize: "var(--fs-small)",
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
              marginTop: "var(--space-sm)",
              letterSpacing: "0.04em",
            }}>
              hard rule: tool-call paths must restrict to tiers {"{0, 11–17}"}. tiers 1–10 will fabricate completed actions.
            </p>
          </div>

          {/* ── Cross-domain principles ── */}
          <PrinciplesCondensed />
        </section>
      </div>
      <Footer />
    </>
  );
}
