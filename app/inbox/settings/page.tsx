"use client";
import { useEffect, useState, useCallback } from "react";
import { Nav, Footer } from "../../_components/Layout";

interface Settings {
  automation_enabled: boolean;
  classification_enabled: boolean;
  rules_enabled: boolean;
  drafting_enabled: boolean;
  rate_limit_per_hour: number;
  updated_at: string;
}

interface Rule {
  id: string;
  name: string;
  match_from_pattern: string | null;
  match_subject_pattern: string | null;
  match_intent: string | null;
  action: "archive" | "delete" | "draft" | "flag";
  confidence_min: number;
  priority: number;
  enabled: boolean;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  archive: "archive",
  delete: "delete",
  draft: "draft reply",
  flag: "flag for review",
};

const INTENT_OPTIONS = [
  "newsletter", "promotion", "cold_sales", "confirmation",
  "catering", "vendor_invoice", "press", "personal", "legal", "auto_reply", "other",
];

const inputSt: React.CSSProperties = {
  background: "var(--glass-bg)",
  border: "1px solid var(--glass-border)",
  borderRadius: 8,
  padding: "7px 10px",
  color: "var(--text-active)",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  height: 34,
  minHeight: "unset",
};

const selectSt: React.CSSProperties = {
  background: "var(--glass-bg-strong)",
  border: "1px solid var(--glass-border)",
  borderRadius: 8,
  color: "var(--text-main)",
  fontSize: 12,
  padding: "6px 10px",
  height: 34,
  fontFamily: "inherit",
  width: "100%",
};

export default function InboxSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingRules, setLoadingRules] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showNewRule, setShowNewRule] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleIntent, setNewRuleIntent] = useState("");
  const [newRuleFromPattern, setNewRuleFromPattern] = useState("");
  const [newRuleSubjectPattern, setNewRuleSubjectPattern] = useState("");
  const [newRuleAction, setNewRuleAction] = useState<"archive" | "delete" | "draft" | "flag">("archive");
  const [newRulePriority, setNewRulePriority] = useState(100);
  const [newRuleConfidence, setNewRuleConfidence] = useState(0.70);
  const [creatingRule, setCreatingRule] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const res = await fetch("/api/inbox/settings");
      if (res.ok) setSettings(await res.json());
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  const fetchRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const res = await fetch("/api/inbox/rules");
      if (res.ok) {
        const json = (await res.json()) as { rules: Rule[] };
        setRules(json.rules ?? []);
      }
    } finally {
      setLoadingRules(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); fetchRules(); }, [fetchSettings, fetchRules]);

  async function updateSetting(key: keyof Settings, value: boolean | number) {
    if (!settings) return;
    setSaving(true);
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try {
      await fetch("/api/inbox/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: Rule) {
    const res = await fetch(`/api/inbox/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    if (res.ok) {
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    }
  }

  async function deleteRule(id: string) {
    if (!confirm("Delete this rule? This can't be undone.")) return;
    const res = await fetch(`/api/inbox/rules/${id}`, { method: "DELETE" });
    if (res.ok) setRules(prev => prev.filter(r => r.id !== id));
  }

  async function createRule() {
    if (!newRuleName || !newRuleAction) return;
    setCreatingRule(true);
    try {
      const res = await fetch("/api/inbox/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRuleName,
          match_intent: newRuleIntent || null,
          match_from_pattern: newRuleFromPattern || null,
          match_subject_pattern: newRuleSubjectPattern || null,
          action: newRuleAction,
          priority: newRulePriority,
          confidence_min: newRuleConfidence,
          enabled: true,
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as Rule;
        setRules(prev => [...prev, created].sort((a, b) => a.priority - b.priority));
        setShowNewRule(false);
        setNewRuleName("");
        setNewRuleIntent("");
        setNewRuleFromPattern("");
        setNewRuleSubjectPattern("");
        setNewRuleAction("archive");
        setNewRulePriority(100);
        setNewRuleConfidence(0.70);
      }
    } finally {
      setCreatingRule(false);
    }
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toLowerCase();

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "108px 24px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <a href="/inbox" style={{
              fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
              fontSize: 10,
              color: "var(--text-muted)",
              textDecoration: "none",
              letterSpacing: "0.06em",
            }}>← inbox</a>
            <span style={{
              fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
              fontSize: 10,
              color: "var(--text-muted)",
              letterSpacing: "0.04em",
            }}>{dateStr}</span>
          </div>
          <div style={{
            fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: 8,
          }}>
            inbox configuration
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{
              margin: 0,
              fontWeight: 300,
              fontSize: "clamp(1.8rem, 3vw, 2.4rem)",
              letterSpacing: "-0.03em",
              color: "var(--text-active)",
              lineHeight: 1,
            }}>
              settings.
            </h1>
            {saving && (
              <span style={{
                fontSize: 10,
                color: "var(--accent-orange)",
                fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
                letterSpacing: "0.06em",
              }}>
                saving…
              </span>
            )}
          </div>
        </div>

        {/* Automation section */}
        <section style={{ marginBottom: 40 }}>
          <div style={{
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            backdropFilter: "blur(var(--blur-amount))",
            borderRadius: "var(--radius-panel)",
            padding: "var(--space-lg)",
          }}>
            <div style={{
              fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: 4,
            }}>
              automation control
            </div>
            <h2 style={{ margin: "0 0 20px", fontWeight: 400, fontSize: 22, letterSpacing: "-0.02em", color: "var(--text-active)" }}>
              automation.
            </h2>

            {loadingSettings ? (
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>checking settings…</div>
            ) : settings ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                <ToggleRow
                  label="master automation"
                  desc="Global kill switch — disables all Arthur automation when off."
                  value={settings.automation_enabled}
                  onChange={v => updateSetting("automation_enabled", v)}
                />
                <ToggleRow
                  label="classification"
                  desc="Arthur classifies each inbound email with intent, urgency, and venue."
                  value={settings.classification_enabled}
                  onChange={v => updateSetting("classification_enabled", v)}
                />
                <ToggleRow
                  label="rule application"
                  desc="Apply rules to classified emails (archive, delete, flag). Safe actions only."
                  value={settings.rules_enabled}
                  onChange={v => updateSetting("rules_enabled", v)}
                />
                <ToggleRow
                  label="auto-drafting"
                  desc="Arthur generates a proposed reply for catering and other high-value emails. Requires your approval before sending."
                  value={settings.drafting_enabled}
                  onChange={v => updateSetting("drafting_enabled", v)}
                />
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "14px 0",
                  borderTop: "1px dashed rgba(255,255,255,0.10)",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", fontSize: 11, color: "var(--text-main)", marginBottom: 2 }}>
                      rate limit (actions/hour)
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
                      Arthur stops taking automated actions once this many are applied in the last 60 minutes.
                    </div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={settings.rate_limit_per_hour}
                    onChange={e => updateSetting("rate_limit_per_hour", parseInt(e.target.value, 10))}
                    style={{ ...inputSt, width: 70, textAlign: "center", fontFamily: "ui-monospace, 'JetBrains Mono', monospace" }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>couldn&apos;t load settings — try refreshing.</div>
            )}
          </div>
        </section>

        {/* Rules section */}
        <section>
          <div style={{
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            backdropFilter: "blur(var(--blur-amount))",
            borderRadius: "var(--radius-panel)",
            padding: "var(--space-lg)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>
                  classification rules
                </div>
                <h2 style={{ margin: 0, fontWeight: 400, fontSize: 22, letterSpacing: "-0.02em", color: "var(--text-active)" }}>
                  rules.
                </h2>
              </div>
              <button
                onClick={() => setShowNewRule(o => !o)}
                style={{
                  background: showNewRule ? "transparent" : "var(--accent-orange)",
                  color: showNewRule ? "var(--text-main)" : "var(--accent-text-on)",
                  border: showNewRule ? "1px solid var(--glass-border)" : "none",
                  borderRadius: "var(--radius-pill)",
                  padding: "7px 16px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {showNewRule ? "cancel" : "+ new rule"}
              </button>
            </div>

            {showNewRule && (
              <div style={{
                border: "1px solid var(--glass-border)",
                borderRadius: 12,
                padding: 20,
                marginBottom: 20,
                background: "var(--glass-bg-strong)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}>
                <FormField label="name">
                  <input value={newRuleName} onChange={e => setNewRuleName(e.target.value)} placeholder="e.g. Auto-archive LinkedIn notifications" style={inputSt} />
                </FormField>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <FormField label="match intent (optional)">
                    <select value={newRuleIntent} onChange={e => setNewRuleIntent(e.target.value)} style={selectSt}>
                      <option value="">— any —</option>
                      {INTENT_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </FormField>
                  <FormField label="action">
                    <select value={newRuleAction} onChange={e => setNewRuleAction(e.target.value as "archive" | "delete" | "draft" | "flag")} style={selectSt}>
                      <option value="archive">archive</option>
                      <option value="delete">delete</option>
                      <option value="flag">flag for review</option>
                      <option value="draft">draft reply</option>
                    </select>
                  </FormField>
                  <FormField label="from pattern (ILIKE)">
                    <input value={newRuleFromPattern} onChange={e => setNewRuleFromPattern(e.target.value)} placeholder="%@news.example.com" style={{ ...inputSt, fontFamily: "ui-monospace, 'JetBrains Mono', monospace" }} />
                  </FormField>
                  <FormField label="subject pattern (ILIKE)">
                    <input value={newRuleSubjectPattern} onChange={e => setNewRuleSubjectPattern(e.target.value)} placeholder="%unsubscribe%" style={{ ...inputSt, fontFamily: "ui-monospace, 'JetBrains Mono', monospace" }} />
                  </FormField>
                  <FormField label="priority (lower = first)">
                    <input type="number" value={newRulePriority} onChange={e => setNewRulePriority(parseInt(e.target.value, 10))} style={inputSt} />
                  </FormField>
                  <FormField label="min confidence (0–1)">
                    <input type="number" step={0.05} min={0} max={1} value={newRuleConfidence} onChange={e => setNewRuleConfidence(parseFloat(e.target.value))} style={inputSt} />
                  </FormField>
                </div>
                <div>
                  <button
                    onClick={createRule}
                    disabled={creatingRule || !newRuleName}
                    style={{
                      background: "var(--accent-orange)",
                      color: "var(--accent-text-on)",
                      border: "none",
                      borderRadius: "var(--radius-pill)",
                      padding: "8px 20px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: creatingRule || !newRuleName ? "not-allowed" : "pointer",
                      opacity: creatingRule || !newRuleName ? 0.5 : 1,
                    }}
                  >
                    {creatingRule ? "creating…" : "create rule"}
                  </button>
                </div>
              </div>
            )}

            {loadingRules ? (
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>pulling rules…</div>
            ) : rules.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "20px 0" }}>no rules yet. create one to automate your inbox.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {rules.map(rule => (
                  <div
                    key={rule.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      border: "1px solid var(--glass-border)",
                      borderRadius: 10,
                      background: rule.enabled ? "var(--glass-bg-strong)" : "var(--glass-bg-faint)",
                      opacity: rule.enabled ? 1 : 0.5,
                    }}
                  >
                    <span style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", fontSize: 9, color: "var(--text-muted)", minWidth: 20, textAlign: "right" }}>
                      {rule.priority}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "var(--text-active)", fontWeight: 400 }}>{rule.name}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "ui-monospace, 'JetBrains Mono', monospace", marginTop: 2 }}>
                        {[
                          rule.match_intent && `intent=${rule.match_intent}`,
                          rule.match_from_pattern && `from ILIKE ${rule.match_from_pattern}`,
                          rule.match_subject_pattern && `subject ILIKE ${rule.match_subject_pattern}`,
                          `conf≥${rule.confidence_min}`,
                        ].filter(Boolean).join(" · ")}
                        {" → "}
                        <span style={{ color: "var(--accent-orange)" }}>{ACTION_LABELS[rule.action]}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleRule(rule)}
                      style={{
                        background: "transparent",
                        color: "var(--text-main)",
                        border: "1px solid var(--glass-border)",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: 10,
                        cursor: "pointer",
                      }}
                    >
                      {rule.enabled ? "disable" : "enable"}
                    </button>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      style={{
                        background: "transparent",
                        color: "var(--text-muted)",
                        border: "1px solid var(--glass-border)",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: 10,
                        cursor: "pointer",
                      }}
                    >
                      delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
      <Footer />
    </>
  );
}

function ToggleRow({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "14px 0",
      borderBottom: "1px dashed rgba(255,255,255,0.10)",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", fontSize: 11, color: "var(--text-main)", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          flexShrink: 0,
          width: 44,
          height: 24,
          borderRadius: 12,
          border: "none",
          background: value ? "var(--accent-orange)" : "var(--glass-bg-strong)",
          cursor: "pointer",
          position: "relative",
          transition: "background 0.2s",
          outline: "1px solid var(--glass-border)",
        }}
      >
        <span style={{
          position: "absolute",
          top: 3,
          left: value ? 22 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: value ? "var(--accent-text-on)" : "rgba(245,246,248,0.5)",
          transition: "left 0.2s",
        }} />
      </button>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
        fontSize: 9,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        marginBottom: 5,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}
