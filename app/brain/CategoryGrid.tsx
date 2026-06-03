"use client";

interface CategoryCard {
  name: string;
  fileCount: number;
  topFiles: string[];
}

interface CategoryGridProps {
  categories: CategoryCard[];
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
  "external-skills": "#8A837A",
  credit: "#fdcb6e",
  legal: "#81ecec",
  research: "#b2bec3",
  email: "#dfe6e9",
  platforms: "#636e72",
  mathematics: "#a8e6cf",
  "image-generation": "#ffeaa7",
  principles: "#0B504F",
  "xero-expert": "#55efc4",
  essex: "#fd79a8",
};

export default function CategoryGrid({ categories }: CategoryGridProps) {
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
            fontFamily: "var(--font-lora, 'Lora', Georgia, serif)",
            fontWeight: 500,
            fontSize: "1.375rem",
            letterSpacing: "-0.02em",
            color: "var(--text-active)",
            margin: 0,
          }}
        >
          by category
        </h2>
        <span
          style={{
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            fontSize: 11,
            color: "var(--text-dim)",
            letterSpacing: "0.04em",
          }}
        >
          {categories.length} domains
        </span>
      </div>

      <div className="category-grid">
        {categories.map((cat) => {
          const color =
            CATEGORY_COLORS[cat.name.toLowerCase()] ||
            CATEGORY_COLORS[cat.name] ||
            "#8892a4";
          return (
            <div
              key={cat.name}
              className="category-card"
              style={{
                background: "var(--glass-bg)",
                border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius-panel)",
                padding: "18px 20px",
                cursor: "pointer",
                transition:
                  "background 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.15s",
              }}
              // TODO: filter the graph and recent-files panel to this category
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily:
                        "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--text-active, var(--text))",
                      fontWeight: 600,
                    }}
                  >
                    {cat.name}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily:
                      "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                    fontSize: 18,
                    fontWeight: 700,
                    color,
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                  }}
                >
                  {cat.fileCount}
                </span>
              </div>

              {/* Top files */}
              {cat.topFiles.length > 0 && (
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {cat.topFiles.map((f) => (
                    <li
                      key={f}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 6,
                        fontFamily:
                          "var(--font-inter, Inter, sans-serif)",
                        fontSize: 11,
                        color: "var(--text-dim)",
                        lineHeight: 1.4,
                      }}
                    >
                      <span
                        style={{
                          width: 3,
                          height: 3,
                          borderRadius: "50%",
                          background: "var(--text-faint, var(--text-dim))",
                          flexShrink: 0,
                          marginTop: 5,
                        }}
                      />
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {f.replace(/\.md$/, "").replace(/-/g, " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .category-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: var(--space-md, 20px);
        }
        @media (max-width: 1200px) {
          .category-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
        @media (max-width: 860px) {
          .category-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (max-width: 560px) {
          .category-grid {
            grid-template-columns: 1fr;
          }
        }
        .category-card:hover {
          background: var(--glass-bg-tier2) !important;
          border-color: var(--glass-border-tier2) !important;
          box-shadow: var(--glass-shadow-tier2) !important;
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
}
