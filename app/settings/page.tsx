"use client";

import { useState } from "react";
import Link from "next/link";
import { Nav, Footer } from "../_components/Layout";

const SECTIONS = [
  {
    id: "profile",
    label: "Profile",
    icon: "◎",
    href: "/settings",
    desc: "Your identity, timezone, and display preferences",
  },
  {
    id: "email",
    label: "Email",
    icon: "✉",
    href: "/settings/email",
    desc: "Connected inboxes, OAuth tokens, sync settings",
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: "⊞",
    href: "/settings",
    desc: "Xero, Stripe, Nylas, Telnyx, and external APIs",
  },
  {
    id: "ai",
    label: "AI Behavior",
    icon: "◈",
    href: "/settings",
    desc: "Proactive mode, tone, context depth, model routing",
  },
  {
    id: "billing",
    label: "Subscription",
    icon: "$",
    href: "/subscriptions",
    desc: "Tracked recurring charges, Privacy.com, Plaid",
  },
  {
    id: "danger",
    label: "Danger Zone",
    icon: "⚠",
    href: null,
    desc: "Destructive actions — clear memory, reset loops",
    danger: true,
  },
];

function ProfileSection() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
      {/* Profile identity row */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-sm)" }}>
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: "var(--glass-bg-strong)",
          border: "2px solid var(--glass-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          fontSize: 28, color: "var(--text-active)", fontWeight: 700,
          letterSpacing: "-0.02em",
        }}>D</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--text-active)", letterSpacing: "-0.02em" }}>Daniel May</h2>
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-dim)", marginTop: 2 }}>Owner · Aspen &amp; May</div>
          <button style={{
            marginTop: "var(--space-xs)",
            background: "transparent",
            border: "1px solid var(--glass-border)",
            borderRadius: 8,
            color: "var(--text-dim)",
            fontSize: "var(--fs-mono)",
            padding: "4px 12px",
            cursor: "pointer",
            letterSpacing: "0.04em",
          }}>Edit Profile</button>
        </div>
      </div>

      {/* Setting rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
        {[
          { label: "Primary Email", value: "blackmarble.m.g@gmail.com", id: "email" },
          { label: "Timezone", value: "America/Detroit (EDT)", id: "tz" },
        ].map(row => (
          <div key={row.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "var(--space-sm) var(--space-md)",
            background: "var(--glass-bg-faint)",
            border: "1px solid var(--glass-border)",
            borderRadius: 10,
          }}>
            <div>
              <div style={{ fontSize: "var(--fs-mono)", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{row.label}</div>
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-active)" }}>{row.value}</div>
            </div>
            <button style={{
              background: "transparent",
              border: "1px solid var(--glass-border)",
              borderRadius: 7,
              color: "var(--text-dim)",
              fontSize: "var(--fs-mono)",
              padding: "5px 14px",
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}>Change</button>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: "var(--glass-border)" }} />
      <FormField
        label="Cell"
        id="cell"
        defaultValue="+1 216 347 0213"
        helpText="Backup contact for SMS alerts when Push is down."
      />
      <FormField
        label="Home airport"
        id="airport"
        defaultValue="GRR"
        helpText="Arthur defaults here for travel research."
      />
      <SaveRow />
    </div>
  );
}

function ToggleSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      style={{
        display: "inline-flex",
        alignItems: "center",
        width: 44,
        height: 24,
        borderRadius: 12,
        background: on ? "var(--accent-orange)" : "var(--glass-bg-strong)",
        border: on ? "none" : "1px solid var(--glass-border)",
        padding: "3px",
        cursor: "pointer",
        transition: "background var(--duration-quick) var(--ease-out-soft)",
        flexShrink: 0,
      }}
    >
      <span style={{
        display: "block",
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: "#fff",
        transform: on ? "translateX(20px)" : "translateX(0)",
        transition: "transform var(--duration-quick) var(--ease-out-soft)",
        boxShadow: "0 1px 3px rgba(5,6,10,0.4)",
      }} />
    </button>
  );
}

function IntegrationsSection() {
  const integrations = [
    { name: "Google Mail", abbr: "GM", status: "connected", detail: "3 inboxes active — blackmarble, yahoo, drinkswithdabney", color: "#EA4335" },
    { name: "Google Calendar", abbr: "GC", status: "connected", detail: "Multi-account sync via iCloud CalDAV push", color: "#4285F4" },
    { name: "Xero", abbr: "XR", status: "connected", detail: "Dabney & Co — last sync 2h ago", color: "#13B5EA" },
    { name: "DocuSign", abbr: "DS", status: "not configured", detail: "E-signature for legal vault", color: "#FFB800" },
    { name: "Stripe", abbr: "ST", status: "not configured", detail: "Financial Connections — link bank accounts", color: "#635BFF" },
    { name: "Plaid", abbr: "PL", status: "not configured", detail: "Detect recurring charges from transactions", color: "#00D64F" },
  ];

  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(integrations.map(i => [i.name, i.status === "connected"]))
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
      {integrations.map(i => {
        const on = enabled[i.name];
        return (
          <div key={i.name} style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--glass-bg-faint)",
            border: "1px solid var(--glass-border)",
            borderRadius: 10,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              background: "var(--glass-bg-strong)",
              border: "1px solid var(--glass-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: "var(--text-active)",
              letterSpacing: "0.02em",
              fontFamily: "var(--font-jetbrains, monospace)",
            }}>{i.abbr}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "var(--text-active)", marginBottom: 2 }}>{i.name}</div>
              <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-dim)", lineHeight: 1.4 }}>{i.detail}</div>
            </div>
            <ToggleSwitch on={on} onToggle={() => setEnabled(prev => ({ ...prev, [i.name]: !prev[i.name] }))} />
          </div>
        );
      })}
    </div>
  );
}

function AIBehaviorSection() {
  const settings = [
    { id: "proactive", label: "Proactive Assistance", desc: "Arthur predicts and executes your next move without being asked" },
    { id: "tone", label: "Tone of Voice", desc: "Direct, technical, no-fluff communication style" },
    { id: "context", label: "Deep Context", desc: "Load all project memory and knowledge into every session" },
  ];
  const [states, setStates] = useState<Record<string, boolean>>({ proactive: true, tone: true, context: true });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {settings.map(s => (
        <div key={s.id} style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          padding: "var(--space-3) var(--space-4)",
          background: "var(--glass-bg-faint)",
          border: "1px solid var(--glass-border)",
          borderRadius: 10,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "var(--text-active)", marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-dim)" }}>{s.desc}</div>
          </div>
          <ToggleSwitch on={states[s.id]} onToggle={() => setStates(prev => ({ ...prev, [s.id]: !prev[s.id] }))} />
        </div>
      ))}
    </div>
  );
}

function DangerSection({ onDelete }: { onDelete: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <p style={{
        fontSize: "var(--fs-small)",
        color: "var(--text-dim)",
        lineHeight: 1.65,
        margin: 0,
      }}>
        Destructive actions are irreversible. Most can be performed from the Arthur CLI at{" "}
        <code style={{ fontSize: "var(--fs-mono)", color: "var(--text-dim)" }}>~/arthur/scripts/</code>.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {[
          { label: "Clear session memory", desc: "Wipes ~/.arthur/data/memory.json. Learning history is lost." },
          { label: "Reset learning loop", desc: "Clears corrections.jsonl and dynamic-rules/. Classifier reverts to base constitution." },
          { label: "Purge all sessions", desc: "Drops the FTS5 session store. Full history gone." },
        ].map(action => (
          <div key={action.label} style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            padding: "var(--space-3) var(--space-4)",
            background: "rgba(239,68,68,0.04)",
            border: "1px solid rgba(239,68,68,0.15)",
            borderRadius: 8,
          }}>
            <div>
              <div style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "#ef4444", marginBottom: 2 }}>{action.label}</div>
              <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)" }}>{action.desc}</div>
            </div>
            <button style={{
              flexShrink: 0,
              background: "none",
              border: "1px solid rgba(239,68,68,0.4)",
              borderRadius: 6,
              color: "#ef4444",
              fontSize: "var(--fs-mono)",
              letterSpacing: "0.04em",
              padding: "5px 12px",
              cursor: "pointer",
            }}
              onClick={action.label.toLowerCase().includes("delete") ? onDelete : undefined}
            >
              run
            </button>
          </div>
        ))}
      </div>
      <div style={{
        padding: "var(--space-3) var(--space-4)",
        background: "rgba(239,68,68,0.04)",
        border: "1px solid rgba(239,68,68,0.25)",
        borderRadius: 8,
        marginTop: "var(--space-2)",
      }}>
        <div style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "#ef4444", marginBottom: "var(--space-2)" }}>Delete account</div>
        <p style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", lineHeight: 1.6, margin: "0 0 var(--space-3)" }}>
          Permanently deletes all Arthur data, sessions, credentials, and integrations. Cannot be undone.
        </p>
        <button
          onClick={onDelete}
          style={{
            background: "#ef4444",
            border: "none",
            borderRadius: 7,
            color: "#fff",
            fontSize: "var(--fs-small)",
            fontWeight: 700,
            padding: "8px 20px",
            cursor: "pointer",
          }}
        >
          Delete account
        </button>
      </div>
    </div>
  );
}

// ── Shared form components ────────────────────────────────────────────────────

function FormField({
  label,
  id,
  defaultValue,
  helpText,
  type = "text",
}: {
  label: string;
  id: string;
  defaultValue?: string;
  helpText?: string;
  type?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <label
        htmlFor={id}
        style={{
          fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
          fontSize: "var(--fs-mono)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-faint)",
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        defaultValue={defaultValue}
        style={{
          background: "var(--panel-elev)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          color: "var(--text)",
          fontSize: "var(--fs-small)",
          padding: "10px var(--space-3)",
          outline: "none",
          transition: "border-color var(--duration-quick) var(--ease-out-soft), box-shadow var(--duration-quick) var(--ease-out-soft)",
          width: "100%",
        }}
        onFocus={e => {
          e.currentTarget.style.borderColor = "var(--accent-orange)";
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(212,255,61,0.12)";
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = "var(--glass-border)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
      {helpText && (
        <p style={{
          fontSize: "var(--fs-mono)",
          color: "var(--text-faint)",
          margin: 0,
          lineHeight: 1.5,
        }}>
          {helpText}
        </p>
      )}
    </div>
  );
}

function SaveRow() {
  const [saved, setSaved] = useState(false);
  return (
    <div style={{ display: "flex", gap: "var(--space-3)", paddingTop: "var(--space-2)" }}>
      <button
        onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}
        style={{
          background: saved ? "#4ade80" : "var(--accent-orange)",
          border: "none",
          borderRadius: 8,
          color: saved ? "#000" : "var(--accent-text-on)",
          fontSize: "var(--fs-small)",
          fontWeight: 700,
          padding: "9px 20px",
          cursor: "pointer",
          transition: "background var(--duration-quick) var(--ease-out-soft)",
        }}
      >
        {saved ? "Saved" : "Save changes"}
      </button>
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteModal({ onClose }: { onClose: () => void }) {
  const [confirm, setConfirm] = useState("");
  const ready = confirm === "DELETE";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(5,6,10,0.85)",
        backdropFilter: "blur(8px)",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--panel)",
        border: "1px solid rgba(239,68,68,0.35)",
        borderRadius: 14,
        padding: "var(--space-6)",
        width: "100%",
        maxWidth: 420,
        boxShadow: "var(--glass-shadow)",
      }}>
        <div style={{
          fontFamily: "var(--font-jetbrains, monospace)",
          fontSize: "var(--fs-mono)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#ef4444",
          marginBottom: "var(--space-3)",
        }}>
          danger zone
        </div>
        <h2 style={{ fontSize: "var(--fs-h3)", fontWeight: 700, color: "var(--text)", margin: "0 0 var(--space-3)" }}>
          Delete account?
        </h2>
        <p style={{ fontSize: "var(--fs-small)", color: "var(--text-dim)", lineHeight: 1.65, margin: "0 0 var(--space-5)" }}>
          This permanently deletes all Arthur sessions, memory, credentials, and integrations.
          Type <strong style={{ color: "#ef4444" }}>DELETE</strong> to confirm.
        </p>
        <input
          type="text"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="DELETE"
          style={{
            width: "100%",
            background: "var(--panel-elev)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            color: "#ef4444",
            fontSize: "var(--fs-small)",
            padding: "10px var(--space-3)",
            outline: "none",
            marginBottom: "var(--space-4)",
            fontFamily: "var(--font-jetbrains, monospace)",
            letterSpacing: "0.1em",
          }}
        />
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <button
            disabled={!ready}
            style={{
              background: ready ? "#ef4444" : "var(--border)",
              border: "none",
              borderRadius: 8,
              color: ready ? "#fff" : "var(--text-faint)",
              fontSize: "var(--fs-small)",
              fontWeight: 700,
              padding: "9px 20px",
              cursor: ready ? "pointer" : "default",
              opacity: ready ? 1 : 0.5,
            }}
          >
            Delete permanently
          </button>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text-dim)",
              fontSize: "var(--fs-small)",
              padding: "9px 20px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("profile");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const current = SECTIONS.find(s => s.id === activeSection);

  return (
    <>
      <Nav />
      <div className="wrap" style={{ paddingTop: 108, paddingBottom: "var(--space-9)" }}>

        {/* Header */}
        <div style={{ marginBottom: "var(--space-6)" }}>
          <span style={{
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            fontSize: "var(--fs-mono)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}>
            system configuration
          </span>
          <h1 style={{
            fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
            fontWeight: 800,
            fontSize: "clamp(2rem, 4vw, 3rem)",
            letterSpacing: "-0.03em",
            color: "var(--text-main)",
            margin: "var(--space-2) 0 var(--space-3)",
            lineHeight: 0.95,
          }}>
            settings.
          </h1>
          <p style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", maxWidth: "52ch", lineHeight: 1.65, margin: 0 }}>
            Configure Arthur&apos;s integrations, connected accounts, and system behavior.
          </p>
        </div>

        {/* 280px sidebar + 1fr content */}
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "var(--space-5)", alignItems: "flex-start" }}>

          {/* Sidebar glass panel */}
          <div style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(var(--blur-amount))",
            border: "1px solid var(--glass-border)",
            borderRadius: "var(--radius-panel)",
            padding: "var(--space-sm)",
            boxShadow: "var(--glass-shadow)",
            position: "sticky",
            top: 108,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}>
            {SECTIONS.map(s => {
              const isActive = s.id === activeSection;
              const isDanger = (s as { danger?: boolean }).danger;
              const isLink = s.href && s.href !== "/settings" && s.id !== "danger";

              const itemStyle = {
                display: "flex",
                alignItems: "center",
                gap: "var(--space-sm)",
                padding: "10px var(--space-sm)",
                background: isActive ? (isDanger ? "rgba(239,68,68,0.10)" : "var(--glass-bg-strong)") : "transparent",
                border: "none",
                borderLeft: isActive ? (isDanger ? "3px solid #ef4444" : "3px solid var(--accent-orange)") : "3px solid transparent",
                borderRadius: isActive ? "0 10px 10px 0" : 10,
                cursor: "pointer",
                textAlign: "left" as const,
                width: "100%",
                transition: "background var(--duration-quick) var(--ease-out-soft)",
                marginTop: isDanger ? "var(--space-sm)" : 0,
                textDecoration: "none",
              };

              const iconStyle = {
                width: 28, height: 28, borderRadius: 7,
                background: isActive ? (isDanger ? "rgba(239,68,68,0.2)" : "var(--glass-bg-strong)") : "var(--glass-bg-faint)",
                border: `1px solid ${isActive ? (isDanger ? "rgba(239,68,68,0.35)" : "var(--glass-border)") : "var(--glass-border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12,
                color: isDanger ? "#ef4444" : (isActive ? "var(--text-active)" : "var(--text-dim)"),
                flexShrink: 0,
                fontFamily: "monospace",
              };

              const labelStyle = {
                fontSize: "var(--fs-small)",
                fontWeight: isActive ? 600 : 400,
                color: isDanger ? "#ef4444" : (isActive ? "var(--text-active)" : "var(--text-dim)"),
              };

              if (isLink) {
                return (
                  <Link key={s.id} href={s.href!} style={{ ...itemStyle, textDecoration: "none" }}>
                    <span style={iconStyle}>{s.icon}</span>
                    <span style={labelStyle}>{s.label}</span>
                  </Link>
                );
              }

              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  style={itemStyle}
                >
                  <span style={iconStyle}>{s.icon}</span>
                  <span style={labelStyle}>{s.label}</span>
                </button>
              );
            })}
          </div>

          {/* Content glass panel */}
          <div style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(var(--blur-amount))",
            border: `1px solid ${activeSection === "danger" ? "rgba(239,68,68,0.25)" : "var(--glass-border)"}`,
            borderRadius: "var(--radius-panel)",
            padding: "var(--space-lg)",
            boxShadow: "var(--glass-shadow)",
          }}>
            {/* Section header */}
            <div style={{ marginBottom: "var(--space-md)" }}>
              <div style={{
                fontFamily: "var(--font-jetbrains, monospace)",
                fontSize: "var(--fs-mono)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: activeSection === "danger" ? "#ef4444" : "var(--text-muted)",
                marginBottom: "var(--space-xs)",
              }}>
                {current?.label ?? "Profile"}
              </div>
              <p style={{ fontSize: "var(--fs-small)", color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.5 }}>
                {current?.desc}
              </p>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "var(--glass-border)", marginBottom: "var(--space-md)" }} />

            {/* Section content */}
            {activeSection === "profile" && <ProfileSection />}
            {activeSection === "integrations" && <IntegrationsSection />}
            {activeSection === "ai" && <AIBehaviorSection />}
            {activeSection === "billing" && (
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.65 }}>
                Subscription management lives at{" "}
                <Link href="/subscriptions" style={{ color: "var(--accent-orange)", textDecoration: "underline" }}>
                  /subscriptions
                </Link>
                .
              </div>
            )}
            {activeSection === "danger" && (
              <DangerSection onDelete={() => setShowDeleteModal(true)} />
            )}
          </div>
        </div>
      </div>

      {showDeleteModal && <DeleteModal onClose={() => setShowDeleteModal(false)} />}

      <Footer />

      <style>{`
        @media (max-width: 768px) {
          .wrap > div:last-child > div:first-child { display: grid; grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
