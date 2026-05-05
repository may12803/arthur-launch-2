"use client";
import { useState } from "react";

const TIERS = [
  { tier: 0,  id: "script",        cost: 0,       label: "Script (no LLM)",                tools: true  },
  { tier: 1,  id: "gliner",        cost: 0,       label: "GLiNER-2-XL (local)",             tools: false },
  { tier: 2,  id: "msa-arbiter",   cost: 0,       label: "MSA-4B (local)",                  tools: false },
  { tier: 3,  id: "gemma4",        cost: 0,       label: "Gemma 3 4B (local)",              tools: false },
  { tier: 4,  id: "arthur-local",  cost: 0,       label: "Arthur-tuned (Qwen2.5-7B + LoRA)",tools: false },
  { tier: 5,  id: "groq",          cost: 0.0003,  label: "Groq Llama 3.3 70B",             tools: false },
  { tier: 6,  id: "cerebras-q235", cost: 0,       label: "Cerebras Qwen-3-235B",            tools: false },
  { tier: 7,  id: "pioneer",       cost: 0.0005,  label: "Pioneer.ai (Fastino)",            tools: false },
  { tier: 8,  id: "deepseek-chat", cost: 0.0014,  label: "DeepSeek Chat",                   tools: false },
  { tier: 9,  id: "deepseek-r1",   cost: 0.0055,  label: "DeepSeek R1 (reason)",            tools: false },
  { tier: 10, id: "sonar-pro",     cost: 0.003,   label: "Perplexity Sonar Pro",            tools: false },
  { tier: 11, id: "haiku",         cost: 0.001,   label: "Claude Haiku",                    tools: true  },
  { tier: 12, id: "gemini-2.5-pro",cost: 0.0035,  label: "Gemini 2.5 Pro",                 tools: true  },
  { tier: 13, id: "kimi-k2.6",     cost: 0.0035,  label: "Kimi K2.6 (Moonshot)",           tools: true  },
  { tier: 14, id: "sonnet",        cost: 0.010,   label: "Claude Sonnet",                   tools: true  },
  { tier: 15, id: "o4",            cost: 0.015,   label: "OpenAI o4",                       tools: true  },
  { tier: 16, id: "claude-code",   cost: 0,       label: "Claude Code CLI",                 tools: true  },
  { tier: 17, id: "opus",          cost: 0.075,   label: "Claude Opus",                     tools: true  },
];

const SAMPLE_ROUTES: Record<string, string[]> = {
  script:         ["date format check", "file exists?", "env var read"],
  gliner:         ["extract vendor name", "classify intent", "parse entity"],
  "msa-arbiter":  ["session rerank", "memory arbitration", "long chain ID"],
  gemma4:         ["draft reply", "summarize docs", "brainstorm names"],
  "arthur-local": ["brand voice edit", "headline tighten", "lowercase check"],
  groq:           ["categorize 500 txns", "batch invoice parse", "classify bulk"],
  "cerebras-q235":["strongest classify", "complex reasoning", "large context"],
  pioneer:        ["adaptive inference", "agentic fine-tune", "fast draft"],
  "deepseek-chat":["low-cost chat", "code explain", "cheap alt"],
  "deepseek-r1":  ["open-weight reason", "math proof", "logic chain"],
  "sonar-pro":    ["research w/ citations", "web search", "fact check"],
  haiku:          ["send email", "file move", "CSV parse"],
  "gemini-2.5-pro":["long-context doc", "multimodal", "vision parse"],
  "kimi-k2.6":    ["multi-file refactor", "long-horizon code", "deep context"],
  sonnet:         ["code review", "strategy plan", "complex debug"],
  o4:             ["high-stakes reason", "adversarial eval", "precision math"],
  "claude-code":  ["prod build", "deploy", "browser automate"],
  opus:           ["sell / raise / pivot", "highest-stakes call", "board brief"],
};

function costBar(cost: number): number {
  if (cost === 0) return 4;
  return Math.max(8, Math.min(90, Math.log10(cost * 1000 + 1) * 45));
}

function costLabel(cost: number, id: string): string {
  if (id === "claude-code" || id === "cerebras-q235") return "sub";
  if (cost === 0) return "$0";
  return `$${cost.toFixed(4).replace(/\.?0+$/, "")}`;
}

export default function ModelLadder() {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {TIERS.map((t) => {
        const isHovered = hovered === t.id;
        const routes = SAMPLE_ROUTES[t.id] ?? [];
        const barW = costBar(t.cost);
        const isArthur = t.id === "arthur-local";

        return (
          <div
            key={t.id}
            onMouseEnter={() => setHovered(t.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: "grid",
              gridTemplateColumns: "40px 1fr 100px 90px",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 8,
              background: isHovered
                ? "var(--glass-bg-strong)"
                : isArthur
                ? "rgba(235,64,0,0.06)"
                : "var(--glass-bg)",
              border: `1px solid ${isHovered ? "var(--line-separator)" : isArthur ? "rgba(235,64,0,0.2)" : "var(--glass-border)"}`,
              transition: "all 150ms var(--ease-out-soft)",
              transform: isHovered ? "translateY(-1px)" : "none",
              boxShadow: isHovered ? "0 4px 16px -4px rgba(245,246,248,0.06)" : "none",
              cursor: "default",
            }}
          >
            {/* Tier number */}
            <span style={{
              fontFamily: "var(--font-jetbrains, monospace)",
              fontSize: "var(--fs-mono)",
              fontWeight: 700,
              color: t.tools ? "var(--accent-orange)" : "var(--text-muted)",
              letterSpacing: "0.04em",
            }}>
              T{t.tier}
            </span>

            {/* Model info */}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: "var(--fs-small)",
                fontWeight: isArthur ? 700 : 500,
                color: "var(--text)",
                lineHeight: 1.3,
                marginBottom: isHovered ? 4 : 0,
                transition: "margin 150ms",
              }}>
                {t.label}
              </div>
              {isHovered && routes.length > 0 && (
                <div style={{
                  display: "flex",
                  gap: 5,
                  flexWrap: "wrap",
                  animation: "fade-in 120ms ease-out",
                }}>
                  {routes.map((r) => (
                    <span key={r} style={{
                      fontFamily: "var(--font-jetbrains, monospace)",
                      fontSize: 10,
                      color: "var(--text-muted)",
                      background: "var(--glass-bg-faint)",
                      border: "1px solid var(--glass-border)",
                      borderRadius: 4,
                      padding: "1px 6px",
                    }}>
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Cost bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                height: 3,
                width: `${barW}%`,
                background: t.cost === 0
                  ? "var(--border-strong)"
                  : "var(--accent-warm)",
                borderRadius: 2,
                minWidth: 4,
                transition: "width 200ms var(--ease-out-soft)",
              }} />
              <span style={{
                fontFamily: "var(--font-jetbrains, monospace)",
                fontSize: 10,
                color: "var(--text-faint)",
                whiteSpace: "nowrap",
              }}>
                {costLabel(t.cost, t.id)}
              </span>
            </div>

            {/* Tool pill */}
            {t.tools ? (
              <span style={{
                fontFamily: "var(--font-jetbrains, monospace)",
                fontSize: 10,
                color: "#4ade80",
                background: "rgba(74,222,128,0.08)",
                border: "1px solid rgba(74,222,128,0.2)",
                borderRadius: 20,
                padding: "2px 8px",
                whiteSpace: "nowrap",
                textAlign: "center",
              }}>
                tools ✓
              </span>
            ) : (
              <span style={{
                fontFamily: "var(--font-jetbrains, monospace)",
                fontSize: 10,
                color: "var(--text-faint)",
                whiteSpace: "nowrap",
                textAlign: "center",
              }}>
                chat only
              </span>
            )}
          </div>
        );
      })}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
