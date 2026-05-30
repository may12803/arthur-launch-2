"use client";

import { useState } from "react";

// v2 Design System — dark, chartreuse accent (#d4ff3d), glass morphism
const D = {
  bg: "#0c0e12",
  surface: "#14161e",
  glass: "rgba(255,255,255,0.04)",
  glassBorder: "rgba(255,255,255,0.08)",
  glassMid: "rgba(255,255,255,0.08)",
  glassMidBorder: "rgba(255,255,255,0.15)",
  accent: "#d4ff3d",
  accentSoft: "rgba(212,255,61,0.14)",
  accentOn: "#1a2400",
  textActive: "#f5f6f8",
  textMain: "rgba(245,246,248,0.85)",
  textMuted: "rgba(245,246,248,0.50)",
  textFaint: "rgba(245,246,248,0.30)",
  sep: "rgba(255,255,255,0.10)",
  tintBlue: "rgba(91,141,239,0.12)",
  tintBlueFg: "rgba(91,141,239,0.90)",
  tintEmerald: "rgba(52,211,153,0.12)",
  tintEmeraldFg: "rgba(52,211,153,0.85)",
  tintRed: "rgba(239,68,68,0.12)",
  tintRedFg: "rgba(239,68,68,0.85)",
  tintAmber: "rgba(251,191,36,0.12)",
  tintAmberFg: "rgba(251,191,36,0.85)",
  radius: "16px",
  radiusSm: "10px",
  radiusPill: "100px",
  mono: "'JetBrains Mono','GeistMono',monospace",
  sans: "var(--font-inter,Inter,system-ui,sans-serif)",
  serif: "var(--font-lora,Lora,Georgia,serif)",
};

const TABS = [
  { id: "general",       label: "General" },
  { id: "email",         label: "Email" },
  { id: "notifications", label: "Notifications" },
  { id: "integrations",  label: "Integrations" },
  { id: "api",           label: "API" },
];

function StatusDot({ status }: { status: "ok" | "pending" | "error" }) {
  const map = {
    ok:      { color: D.tintEmeraldFg, bg: D.tintEmerald },
    pending: { color: D.tintAmberFg,   bg: D.tintAmber },
    error:   { color: D.tintRedFg,     bg: D.tintRed },
  };
  const { color, bg } = map[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", background: bg, color, fontSize: 10, fontWeight: 700 }}>
      {status === "ok" ? "✓" : status === "pending" ? "⚠" : "✗"}
    </span>
  );
}

function Field({ label, id, defaultValue, helpText, type = "text" }: {
  label: string; id: string; defaultValue?: string; helpText?: string; type?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label htmlFor={id} style={{ fontFamily: D.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: D.textMuted }}>
        {label}
      </label>
      <input
        id={id} type={type} defaultValue={defaultValue}
        style={{
          background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: D.radiusSm,
          color: D.textActive, fontSize: 13.5, padding: "10px 14px", outline: "none",
          width: "100%", fontFamily: D.sans, transition: "border-color 150ms, box-shadow 150ms",
        }}
        onFocus={e => {
          e.currentTarget.style.borderColor = D.accent;
          e.currentTarget.style.boxShadow = `0 0 0 3px rgba(212,255,61,0.15)`;
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = D.glassBorder;
          e.currentTarget.style.boxShadow = "none";
        }}
      />
      {helpText && <p style={{ fontSize: 12, color: D.textMuted, margin: 0, lineHeight: 1.5 }}>{helpText}</p>}
    </div>
  );
}

function SaveRow() {
  const [saved, setSaved] = useState(false);
  return (
    <div style={{ paddingTop: 8 }}>
      <button
        onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}
        style={{
          background: saved ? D.accentSoft : D.accent, border: "none", borderRadius: D.radiusSm,
          color: saved ? D.accent : D.accentOn, fontSize: 13.5, fontWeight: 700, padding: "10px 22px",
          cursor: "pointer", transition: "all 150ms", fontFamily: D.sans,
        }}
      >
        {saved ? "✓ Saved" : "Save changes"}
      </button>
    </div>
  );
}

function ProfileSection() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: D.accentSoft, border: `1px solid ${D.accent}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, color: D.accent, fontWeight: 700, flexShrink: 0,
          fontFamily: D.serif,
        }}>D</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: "0 0 2px", fontSize: 18, fontWeight: 500, color: D.textActive, letterSpacing: "-0.02em", fontFamily: D.serif }}>Daniel May</h2>
          <p style={{ fontSize: 13, color: D.textMuted, margin: "0 0 10px" }}>Owner · Aspen &amp; May</p>
          <button style={{ background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: D.radiusPill, color: D.textMain, fontSize: 12.5, padding: "5px 14px", cursor: "pointer", fontFamily: D.sans }}>
            Edit Photo
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { label: "Primary Email", value: "blackmarble.m.g@gmail.com" },
          { label: "Timezone", value: "America/Detroit (EDT)" },
        ].map(row => (
          <div key={row.label} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: D.radiusSm,
          }}>
            <div>
              <div style={{ fontFamily: D.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: D.textMuted, marginBottom: 3 }}>{row.label}</div>
              <div style={{ fontSize: 13.5, color: D.textActive, fontFamily: D.sans }}>{row.value}</div>
            </div>
            <button style={{ background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: D.radiusPill, color: D.textMain, fontSize: 12.5, padding: "5px 14px", cursor: "pointer", fontFamily: D.sans }}>Change</button>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: D.sep }} />
      <Field label="Cell" id="cell" defaultValue="+1 216 347 0213" helpText="Backup contact for SMS alerts when Push is down." />
      <Field label="Home Airport" id="airport" defaultValue="GRR" helpText="Arthur defaults here for travel research." />
      <SaveRow />
    </div>
  );
}

function IntegrationsSection() {
  const integrations: { name: string; status: "ok" | "pending" | "error"; detail: string }[] = [
    { name: "Google Mail",      status: "ok",      detail: "3 inboxes active — blackmarble, yahoo, drinkswithdabney" },
    { name: "Google Calendar",  status: "ok",      detail: "Multi-account sync via iCloud CalDAV push" },
    { name: "Xero",             status: "ok",      detail: "Dabney & Co — last sync 2h ago" },
    { name: "DocuSign",         status: "error",   detail: "Token expired. Please re-authenticate." },
    { name: "Stripe",           status: "pending", detail: "Financial Connections — link bank accounts" },
    { name: "Plaid",            status: "pending", detail: "Detect recurring charges from transactions" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {integrations.map(i => (
        <div key={i.name} style={{
          display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
          background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: D.radiusSm,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: D.textActive, marginBottom: 3, fontFamily: D.sans }}>
              {i.name}
              <StatusDot status={i.status} />
            </div>
            <div style={{ fontSize: 12.5, color: D.textMuted, lineHeight: 1.4, fontFamily: D.sans }}>{i.detail}</div>
          </div>
          <button style={{ background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: D.radiusPill, color: D.textMain, fontSize: 12.5, padding: "5px 14px", cursor: "pointer", flexShrink: 0, fontFamily: D.sans }}>
            {i.status === "ok" ? "Manage" : "Connect"}
          </button>
        </div>
      ))}
    </div>
  );
}

function PlaceholderSection({ title }: { title: string }) {
  return (
    <div style={{ padding: "48px 0", textAlign: "center", border: `1px dashed ${D.glassBorder}`, borderRadius: D.radiusSm, background: D.glass }}>
      <h3 style={{ color: D.textMain, margin: "0 0 6px", fontFamily: D.serif, fontWeight: 500 }}>{title}</h3>
      <p style={{ color: D.textMuted, margin: 0, fontSize: 13, fontFamily: D.sans }}>Configuration for this section is not yet available.</p>
    </div>
  );
}

function DangerSection({ onDelete }: { onDelete: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 40, paddingTop: 28, borderTop: `1px solid ${D.sep}` }}>
      <div>
        <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: D.tintRedFg, fontFamily: D.sans }}>Danger Zone</h3>
        <p style={{ fontSize: 13, color: D.textMuted, margin: 0, lineHeight: 1.6, fontFamily: D.sans }}>
          Destructive actions are irreversible. Most can be performed from the Arthur CLI.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { label: "Clear session memory",   desc: "Wipes ~/.arthur/data/memory.json. Learning history is lost." },
          { label: "Reset learning loop",     desc: "Clears corrections.jsonl and dynamic-rules/. Classifier reverts to base." },
          { label: "Purge all sessions",      desc: "Drops the FTS5 session store. Full history gone." },
        ].map(action => (
          <div key={action.label} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "14px 16px",
            background: D.tintRed, border: `1px solid rgba(239,68,68,0.2)`, borderRadius: D.radiusSm,
          }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: D.textActive, marginBottom: 3, fontFamily: D.sans }}>{action.label}</div>
              <div style={{ fontSize: 12.5, color: D.textMuted, fontFamily: D.sans }}>{action.desc}</div>
            </div>
            <button style={{ flexShrink: 0, background: "transparent", border: `1px solid rgba(239,68,68,0.4)`, borderRadius: D.radiusPill, color: D.tintRedFg, fontSize: 12.5, padding: "5px 14px", cursor: "pointer", fontFamily: D.sans }}>
              Run
            </button>
          </div>
        ))}
      </div>
      <div style={{ padding: 16, background: D.tintRed, border: `1px solid rgba(239,68,68,0.2)`, borderRadius: D.radiusSm }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: D.textActive, marginBottom: 6, fontFamily: D.sans }}>Delete account</div>
        <p style={{ fontSize: 13, color: D.textMuted, lineHeight: 1.6, margin: "0 0 14px", fontFamily: D.sans }}>
          Permanently deletes all Arthur data, sessions, credentials, and integrations. Cannot be undone.
        </p>
        <button onClick={onDelete} style={{ background: D.tintRedFg, border: "none", borderRadius: D.radiusSm, color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "9px 18px", cursor: "pointer", fontFamily: D.sans }}>
          Delete account…
        </button>
      </div>
    </div>
  );
}

function DeleteModal({ onClose }: { onClose: () => void }) {
  const [confirm, setConfirm] = useState("");
  const ready = confirm === "DELETE";
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
    >
      <div style={{ background: "#14161e", border: `1px solid rgba(239,68,68,0.3)`, borderRadius: D.radius, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
        <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: D.tintRedFg, marginBottom: 10 }}>Danger Zone</div>
        <h2 style={{ fontFamily: D.serif, fontSize: 20, fontWeight: 500, color: D.textActive, margin: "0 0 10px" }}>Delete account?</h2>
        <p style={{ fontSize: 13.5, color: D.textMuted, lineHeight: 1.6, margin: "0 0 20px", fontFamily: D.sans }}>
          This permanently deletes all Arthur sessions, memory, credentials, and integrations.
          Type <strong style={{ color: D.tintRedFg }}>DELETE</strong> to confirm.
        </p>
        <input
          type="text" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="DELETE"
          style={{ width: "100%", background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: D.radiusSm, color: D.tintRedFg, fontSize: 14, padding: "10px 14px", outline: "none", marginBottom: 14, letterSpacing: "0.1em", textAlign: "center", fontFamily: D.mono, boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <button disabled={!ready} style={{ flex: 1, background: ready ? D.tintRedFg : "transparent", border: `1px solid rgba(239,68,68,0.4)`, borderRadius: D.radiusSm, color: ready ? "#fff" : D.tintRedFg, fontSize: 13.5, fontWeight: 600, padding: "10px 18px", cursor: ready ? "pointer" : "not-allowed", opacity: ready ? 1 : 0.5, fontFamily: D.sans }}>
            Delete permanently
          </button>
          <button onClick={onClose} style={{ flex: 1, background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: D.radiusSm, color: D.textMain, fontSize: 13.5, padding: "10px 18px", cursor: "pointer", fontFamily: D.sans }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case "general":       return <ProfileSection />;
      case "email":         return <PlaceholderSection title="Email Accounts" />;
      case "notifications": return <PlaceholderSection title="Notifications" />;
      case "integrations":  return <IntegrationsSection />;
      case "api":           return <PlaceholderSection title="API Keys" />;
      default:              return null;
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: D.bg, padding: "32px 40px", fontFamily: D.sans }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: D.textMuted, marginBottom: 8 }}>
            preferences
          </div>
          <h1 style={{ fontFamily: D.serif, fontSize: 28, fontWeight: 500, color: D.textActive, letterSpacing: "-.025em", lineHeight: 1.2, margin: "0 0 6px" }}>
            Settings
          </h1>
          <p style={{ fontSize: 13.5, color: D.textMuted, maxWidth: "52ch", lineHeight: 1.6, margin: 0 }}>
            Configure integrations, connected accounts, and system behavior.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 24, borderBottom: `1px solid ${D.sep}` }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "9px 14px", background: "none", border: "none",
                  borderBottom: `2px solid ${active ? D.accent : "transparent"}`,
                  color: active ? D.accent : D.textMuted,
                  cursor: "pointer", fontSize: 13.5, fontWeight: active ? 600 : 500,
                  transition: "color 150ms, border-color 150ms", marginBottom: -1,
                  fontFamily: D.sans,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content panel */}
        <div style={{ background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: D.radius, padding: 28, backdropFilter: "blur(16px)" }}>
          {renderContent()}
          {activeTab === "general" && <DangerSection onDelete={() => setShowDeleteModal(true)} />}
        </div>

      </div>
      {showDeleteModal && <DeleteModal onClose={() => setShowDeleteModal(false)} />}
    </div>
  );
}
