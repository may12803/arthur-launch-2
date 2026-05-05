"use client";

import { useState } from "react";
import SkillsGrid from "../SkillsGrid";

interface Skill {
  name: string;
  description: string;
  category?: string;
}

const CATEGORIES = [
  "design", "engineering", "seo", "finance", "legal", "ai",
  "ops", "content", "data", "security", "marketing", "business",
];

function inferCategory(skill: Skill): string | null {
  const lower = skill.name.toLowerCase() + " " + skill.description.toLowerCase();
  for (const cat of CATEGORIES) {
    if (lower.includes(cat)) return cat;
  }
  return null;
}

export default function SkillsLayout({ skills }: { skills: Skill[] }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const catCounts = CATEGORIES.map(cat => ({
    cat,
    count: skills.filter(s => inferCategory(s) === cat).length,
  })).filter(c => c.count > 0);

  const filtered = activeCategory
    ? skills.filter(s => inferCategory(s) === activeCategory)
    : skills;

  return (
    <>
      <style>{`
        @media (max-width: 640px) {
          .skills-layout { display: flex !important; flex-direction: column !important; }
          .skills-sidebar { position: static !important; }
          .skills-sidebar-inner { flex-direction: row !important; flex-wrap: wrap !important; }
          .skills-sidebar-inner button { width: auto !important; }
        }
      `}</style>
    <div className="skills-layout" style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "var(--space-md)", alignItems: "start" }}>
      {/* Left: category rail — glass panel */}
      <aside className="skills-sidebar" style={{
        background: "var(--glass-bg)",
        border: "1px solid var(--glass-border)",
        backdropFilter: "blur(var(--blur-amount))",
        borderRadius: "var(--radius-panel)",
        padding: "var(--space-md)",
        position: "sticky",
        top: 80,
        boxShadow: "var(--glass-shadow)",
      }}>
        <div style={{
          fontSize: 9,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          marginBottom: "var(--space-sm)",
          fontFamily: "var(--font-jetbrains, monospace)",
          fontWeight: 700,
        }}>
          categories
        </div>
        <div className="skills-sidebar-inner" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            style={{
              background: activeCategory === null ? "rgba(235,64,0,0.12)" : "transparent",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              padding: "6px var(--space-sm)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              textAlign: "left",
              transition: "background 150ms",
            }}
          >
            <span style={{
              fontSize: "var(--fs-small)",
              color: activeCategory === null ? "var(--accent-orange)" : "var(--text-active)",
              fontWeight: activeCategory === null ? 700 : 400,
            }}>
              all
            </span>
            <span style={{
              fontFamily: "var(--font-jetbrains, monospace)",
              fontSize: "var(--fs-mono)",
              color: "var(--text-muted)",
            }}>
              {skills.length}
            </span>
          </button>

          {catCounts.map(({ cat, count }) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              style={{
                background: activeCategory === cat ? "rgba(235,64,0,0.08)" : "transparent",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                padding: "6px var(--space-sm)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                textAlign: "left",
                transition: "background 150ms",
              }}
            >
              <span style={{
                fontSize: "var(--fs-small)",
                color: activeCategory === cat ? "var(--accent-orange)" : "var(--text-active)",
                fontWeight: activeCategory === cat ? 700 : 400,
              }}>
                {cat}
              </span>
              <span style={{
                fontFamily: "var(--font-jetbrains, monospace)",
                fontSize: "var(--fs-mono)",
                color: "var(--text-muted)",
              }}>
                {count}
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Right: skills grid */}
      <div>
        {activeCategory && (
          <div style={{
            marginBottom: "var(--space-sm)",
            fontSize: "var(--fs-mono)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-jetbrains, monospace)",
          }}>
            {filtered.length} skills in{" "}
            <span style={{ color: "var(--accent-orange)" }}>{activeCategory}</span>
            {" · "}
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: "var(--fs-mono)",
                fontFamily: "var(--font-jetbrains, monospace)",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              clear
            </button>
          </div>
        )}
        <SkillsGrid skills={filtered} />
      </div>
    </div>
    </>
  );
}
