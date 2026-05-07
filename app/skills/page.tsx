import fs from "fs";
import path from "path";
import Link from "next/link";
import { Nav, Footer } from "../_components/Layout";
import SkillsLayout from "./_components/SkillsLayout";

function loadSkills(): { name: string; description: string }[] {
  for (const file of ["/data/skills.json", path.join(process.cwd(), "public", "skills.json")]) {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {}
  }
  try {
    const lib = "/data/skill-library.jsonl";
    if (fs.existsSync(lib)) {
      const seen = new Map();
      for (const line of fs.readFileSync(lib, "utf8").trim().split("\n").filter(Boolean)) {
        try {
          const r = JSON.parse(line);
          const key = `${r.domain}::${r.name}`;
          seen.set(key, { name: `${r.name} (${r.domain})`, description: (r.prompt || "").slice(0, 200) });
        } catch {}
      }
      return [...seen.values()];
    }
  } catch {}
  return [];
}

export default function SkillsPage() {
  const skills = loadSkills();

  return (
    <>
      <Nav />
      <div className="wrap" style={{ paddingTop: 108, paddingBottom: "var(--space-xl)" }}>

        {/* ── Header ── */}
        <div style={{
          marginBottom: "var(--space-lg)",
        }}>
          <span style={{
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            fontSize: "var(--fs-mono)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}>
            {skills.length} skills installed · ~/.claude/skills/
          </span>
          <h1 style={{
            fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
            fontWeight: 800,
            fontSize: "var(--fs-h1)",
            letterSpacing: "-0.03em",
            color: "var(--text-active)",
            margin: "8px 0 12px",
            lineHeight: 0.95,
          }}>skills.</h1>
          <p style={{
            fontSize: "var(--fs-body)",
            color: "var(--text-muted)",
            maxWidth: "58ch",
            lineHeight: 1.65,
            margin: 0,
          }}>
            Packaged workflows Arthur invokes autonomously when context fits. Filter by category or search inside.
          </p>
        </div>

        {/* ── Skill count stat strip ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "var(--space-sm)",
          marginBottom: "var(--space-lg)",
        }}>
          {[
            { value: String(skills.length), label: "total skills" },
            { value: String(skills.filter(s => ["design","engineering","frontend"].some(k => s.name.toLowerCase().includes(k))).length), label: "engineering" },
            { value: String(skills.filter(s => ["seo","content","marketing"].some(k => s.name.toLowerCase().includes(k))).length), label: "marketing" },
            { value: String(skills.filter(s => ["finance","legal","ai","data"].some(k => s.name.toLowerCase().includes(k))).length), label: "ops + intel" },
          ].map(({ value, label }) => (
            <div key={label} style={{
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
              backdropFilter: "blur(var(--blur-amount))",
              borderRadius: "var(--radius-panel)",
              padding: "var(--space-md)",
              textAlign: "center",
            }}>
              <div style={{
                fontFamily: "var(--font-jetbrains, monospace)",
                fontSize: "var(--fs-h2)",
                fontWeight: 700,
                color: "var(--text-active)",
                lineHeight: 1,
                letterSpacing: "-0.03em",
              }}>{value}</div>
              <div style={{
                fontFamily: "var(--font-jetbrains, monospace)",
                fontSize: "var(--fs-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
                marginTop: "var(--space-xs)",
              }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Category rail + skill grid ── */}
        <SkillsLayout skills={skills} />

        <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-lg)" }}>
          <Link href="/dashboard" className="cta-btn">try Arthur →</Link>
          <Link href="/" className="btn-ghost">← home</Link>
        </div>
      </div>
      <Footer />
    </>
  );
}
