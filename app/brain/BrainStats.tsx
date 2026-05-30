"use client";

interface StatCard {
  value: string;
  label: string;
}

interface BrainStatsProps {
  stats: StatCard[];
}

export default function BrainStats({ stats }: BrainStatsProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "var(--space-md, 20px)",
      }}
      className="brain-stats-grid"
    >
      {stats.map(({ value, label }) => (
        <div
          key={label}
          style={{
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            borderRadius: "var(--radius-panel)",
            padding: "24px 20px",
            textAlign: "center",
            backdropFilter: "blur(12px)",
            boxShadow: "var(--glass-shadow)",
            transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s",
          }}
          className="brain-stat-card"
        >
          <div
            style={{
              fontFamily: "var(--font-lora, 'Lora', Georgia, serif)",
              fontSize: "2.25rem",
              fontWeight: 500,
              color: "var(--text-active, #f5f6f8)",
              lineHeight: 1,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </div>
          <div
            style={{
              fontFamily: "var(--font-inter, Inter, sans-serif)",
              fontSize: "12px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-muted, var(--text-dim))",
              marginTop: 8,
            }}
          >
            {label}
          </div>
        </div>
      ))}
      <style>{`
        @media (max-width: 640px) {
          .brain-stats-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        .brain-stat-card:hover {
          background: var(--glass-bg-tier2) !important;
          border-color: var(--glass-border-tier2) !important;
          box-shadow: var(--glass-shadow-tier2) !important;
        }
      `}</style>
    </div>
  );
}
