"use client";

interface RecentFile {
  title: string;
  category: string;
  timestamp: string | null;
}

interface RecentFilesProps {
  files: RecentFile[];
}

const CATEGORY_COLORS: Record<string, string> = {
  engineering: "#4ecdc4",
  business: "#f7b731",
  "ai-research": "#a29bfe",
  design: "#fd79a8",
  finance: "#55efc4",
  sales: "#e17055",
  restaurant: "#fab1a0",
  security: "#6c5ce7",
  languages: "#00b894",
  algorithms: "#0984e3",
  meta: "#74b9ff",
  "external-skills": "#d4ff3d",
  credit: "#fdcb6e",
  legal: "#81ecec",
  research: "#b2bec3",
  platforms: "#636e72",
  mathematics: "#a8e6cf",
  principles: "#d4ff3d",
};

function relativeTime(isoString: string | null): string {
  if (!isoString) return "—";
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function RecentFiles({ files }: RecentFilesProps) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: "var(--space-md, 20px)",
        }}
      >
        <h2
          style={{
            fontFamily:
              "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
            fontWeight: 700,
            fontSize: "1.5rem",
            letterSpacing: "-0.02em",
            color: "var(--text-active, var(--text))",
            margin: 0,
          }}
        >
          recent additions
        </h2>
      </div>

      <div
        style={{
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          borderRadius: "var(--radius-panel)",
          overflow: "hidden",
          boxShadow: "var(--glass-shadow)",
        }}
      >
        {files.map((file, i) => {
          const color =
            CATEGORY_COLORS[file.category.toLowerCase()] ||
            CATEGORY_COLORS[file.category] ||
            "#8892a4";
          return (
            <div
              key={`${file.title}-${i}`}
              className="recent-file-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 20px",
                borderBottom:
                  i < files.length - 1
                    ? "1px solid var(--glass-border)"
                    : "none",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              // TODO: preview this file on click
              onClick={() => {
                console.log("[brain] recent file click:", file.title);
              }}
            >
              {/* Category dot */}
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                  boxShadow: `0 0 4px ${color}60`,
                  flexShrink: 0,
                }}
              />

              {/* Title */}
              <span
                style={{
                  fontFamily: "var(--font-inter, Inter, sans-serif)",
                  fontSize: 13,
                  color: "var(--text-active, var(--text))",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: 1.4,
                }}
              >
                {file.title}
              </span>

              {/* Category badge */}
              <span
                style={{
                  fontFamily:
                    "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color,
                  background: `${color}18`,
                  border: `1px solid ${color}40`,
                  borderRadius: "var(--radius-pill, 999px)",
                  padding: "2px 8px",
                  flexShrink: 0,
                }}
              >
                {file.category}
              </span>

              {/* Timestamp */}
              <span
                style={{
                  fontFamily:
                    "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                  fontSize: 10,
                  color: "var(--text-dim)",
                  flexShrink: 0,
                  letterSpacing: "0.04em",
                  minWidth: 52,
                  textAlign: "right",
                }}
              >
                {relativeTime(file.timestamp)}
              </span>
            </div>
          );
        })}
      </div>

      <style>{`
        .recent-file-row:hover {
          background: var(--glass-bg-tier2) !important;
        }
      `}</style>
    </div>
  );
}
