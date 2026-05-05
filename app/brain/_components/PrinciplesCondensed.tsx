import fs from "fs";
import path from "path";

interface Principle {
  id?: string;
  principle: string;
  confidence: number;
}

function loadPrinciples(): Principle[] {
  try {
    const file = path.join(process.cwd(), "public", "principles.json");
    return JSON.parse(fs.readFileSync(file, "utf8")) as Principle[];
  } catch {
    return [];
  }
}

function confColor(conf: number): string {
  if (conf >= 0.85) return "var(--accent-warm)";
  if (conf >= 0.70) return "var(--accent-cool)";
  return "var(--text-faint)";
}

export default function PrinciplesCondensed() {
  const principles = loadPrinciples()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);

  if (principles.length === 0) return null;

  return (
    <div style={{ marginTop: 56, paddingTop: 40, borderTop: "1px solid var(--border)" }}>
      <span style={{
        fontFamily: "var(--font-jetbrains, monospace)",
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--text-faint)",
      }}>
        cross-domain principles · top {principles.length} by confidence
      </span>
      <h2 style={{
        fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
        fontWeight: 700,
        fontSize: 22,
        letterSpacing: "-0.02em",
        margin: "10px 0 20px",
        color: "var(--text)",
      }}>
        what arthur knows.
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 760 }}>
        {principles.map((p, i) => (
          <div key={p.id || i} style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "12px 16px",
            background: "rgba(19,22,27,0.6)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}>
            {/* Confidence dot */}
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: confColor(p.confidence),
              flexShrink: 0,
              marginTop: 5,
            }} />
            {/* Principle text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                margin: 0,
                fontSize: 13,
                color: "var(--text)",
                lineHeight: 1.55,
                letterSpacing: "-0.005em",
              }}>
                {p.principle}
              </p>
            </div>
            {/* Confidence value */}
            <span style={{
              fontFamily: "var(--font-jetbrains, monospace)",
              fontSize: 10,
              color: confColor(p.confidence),
              flexShrink: 0,
              marginTop: 2,
            }}>
              {Math.round(p.confidence * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
