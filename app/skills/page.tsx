import skillsData from "../../data/skills.json";
import SkillsLayout from "./_components/SkillsLayout";

const skills = skillsData || [];

const statItems = [
  { value: String(skills.length), label: "total skills" },
  {
    value: String(
      skills.filter((s: { name: string }) =>
        ["design","engineering","frontend","next","react","web"].some(k => s.name.toLowerCase().includes(k))
      ).length
    ),
    label: "engineering",
  },
  {
    value: String(
      skills.filter((s: { name: string }) =>
        ["seo","content","marketing","ad","brand"].some(k => s.name.toLowerCase().includes(k))
      ).length
    ),
    label: "marketing",
  },
  {
    value: String(
      skills.filter((s: { name: string }) =>
        ["finance","legal","ai","data","research"].some(k => s.name.toLowerCase().includes(k))
      ).length
    ),
    label: "ops + intel",
  },
];

export default function SkillsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0c0e12", padding: "32px 40px", fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontFamily: "'JetBrains Mono','GeistMono',monospace",
            fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
            color: "rgba(245,246,248,0.50)", marginBottom: 8,
          }}>
            {skills.length} skills · ~/.claude/skills/
          </div>
          <h1 style={{
            fontFamily: "var(--font-lora, Lora, Georgia, serif)", fontWeight: 500, fontSize: 28,
            letterSpacing: "-0.025em", color: "#f5f6f8", margin: "0 0 6px", lineHeight: 1.2,
          }}>Skills</h1>
          <p style={{ fontSize: 13.5, color: "rgba(245,246,248,0.50)", maxWidth: "58ch", lineHeight: 1.6, margin: 0 }}>
            Packaged workflows Arthur invokes autonomously when context fits.
          </p>
        </div>

        {/* Stat strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 32 }}>
          {statItems.map(({ value, label }) => (
            <div key={label} style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, padding: "20px 16px", textAlign: "center",
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono','GeistMono',monospace", fontSize: 28, fontWeight: 700,
                color: "#d4ff3d", lineHeight: 1, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums",
              }}>{value}</div>
              <div style={{
                fontFamily: "'JetBrains Mono','GeistMono',monospace", fontSize: 9, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(245,246,248,0.30)", marginTop: 8,
              }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Skills grid */}
        <SkillsLayout skills={skills} />
      </div>
    </div>
  );
}
