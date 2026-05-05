"use client";

import { useState } from "react";
import Link from "next/link";
import { Nav, Footer } from "../_components/Layout";

const TABS = [
  { id: "general", label: "General" },
  { id: "email", label: "Email Accounts" },
  { id: "notifications", label: "Notifications" },
  { id: "integrations", label: "Integrations" },
  { id: "api", label: "API" },
];

function StatusBadge({ status }: { status: "ok" | "pending" | "error" }) {
  const config = {
    ok: {
      icon: "✓",
      color: "var(--tint-emerald)",
      bgColor: "var(--tint-emerald-soft)",
    },
    pending: {
      icon: "⚠",
      color: "var(--tint-amber)",
      bgColor: "var(--tint-amber-soft)",
    },
    error: {
      icon: "✗",
      color: "var(--tint-red)",
      bgColor: "var(--tint-red-soft)",
    },
  };
  const { icon, color, bgColor } = config[status];

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 20,
      height: 20,
      borderRadius: "50%",
      backgroundColor: bgColor,
      color: color,
      fontSize: 12,
      fontWeight: 700,
    }}>
      {icon}
    </span>
  );
}

function ProfileSection() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Profile identity row */}
      <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: "var(--glass-t2-bg)",
          border: "1px solid var(--glass-t2-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          fontSize: 32, color: "var(--text-active)", fontWeight: 700,
          letterSpacing: "-0.02em",
        }}>D</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600, color: "var(--text-active)", letterSpacing: "-0.02em" }}>Daniel May</h2>
          <p style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "4px", marginBlockEnd: "12px" }}>Owner · Aspen &amp; May</p>
          <button style={{
            background: "var(--glass-t1-bg)",
            border: "1px solid var(--glass-t1-border)",
            borderRadius: "var(--radius-pill)",
            color: "var(--text-main)",
            fontSize: "13px",
            padding: "6px 16px",
            cursor: "pointer",
            transition: "background 150ms ease, border-color 150ms ease",
          }}
            onMouseOver={e => { e.currentTarget.style.background = 'var(--glass-t2-bg)'; e.currentTarget.style.borderColor = 'var(--glass-t2-border)'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'var(--glass-t1-bg)'; e.currentTarget.style.borderColor = 'var(--glass-t1-border)'; }}
          >Edit Profile</button>
        </div>
      </div>

      {/* Setting rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {[
          { label: "Primary Email", value: "blackmarble.m.g@gmail.com", id: "email" },
          { label: "Timezone", value: "America/Detroit (EDT)", id: "tz" },
        ].map(row => (
          <div key={row.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px",
            background: "var(--bg-mid)",
            border: "1px solid var(--glass-t1-border)",
            borderRadius: "var(--radius-card)",
          }}>
            <div>
              <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{row.label}</div>
              <div style={{ fontSize: "14px", color: "var(--text-active)" }}>{row.value}</div>
            </div>
            <button style={{
              background: "var(--glass-t1-bg)",
              border: "1px solid var(--glass-t1-border)",
              borderRadius: "var(--radius-pill)",
              color: "var(--text-main)",
              fontSize: "13px",
              padding: "6px 16px",
              cursor: "pointer",
              transition: "background 150ms ease, border-color 150ms ease",
            }}
              onMouseOver={e => { e.currentTarget.style.background = 'var(--glass-t2-bg)'; e.currentTarget.style.borderColor = 'var(--glass-t2-border)'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'var(--glass-t1-bg)'; e.currentTarget.style.borderColor = 'var(--glass-t1-border)'; }}
            >Change</button>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: "var(--line-separator)" }} />
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
      <div style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6 }}>
        Subscription management lives at{" "}
        <Link href="/subscriptions" style={{ color: "var(--accent-orange)", textDecoration: "none", fontWeight: 500 }}>
          /subscriptions
        </Link>
        .
      </div>
      <SaveRow />
    </div>
  );
}

function PlaceholderSection({ title }: { title: string }) {
  return (
    <div style={{
      padding: "64px 0",
      textAlign: "center",
      border: "1px dashed var(--glass-t1-border)",
      borderRadius: "var(--radius-card)",
      background: "var(--bg-mid)",
    }}>
      <h3 style={{ color: "var(--text-main)", margin: "0 0 8px 0" }}>{title} Settings</h3>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>Configuration for this section is not yet available.</p>
    </div>
  );
}

function IntegrationsSection() {
  const integrations = [
    { name: "Google Mail", status: "ok", detail: "3 inboxes active — blackmarble, yahoo, drinkswithdabney" },
    { name: "Google Calendar", status: "ok", detail: "Multi-account sync via iCloud CalDAV push" },
    { name: "Xero", status: "ok", detail: "Dabney & Co — last sync 2h ago" },
    { name: "DocuSign", status: "error", detail: "Token expired. Please re-authenticate." },
    { name: "Stripe", status: "pending", detail: "Financial Connections — link bank accounts" },
    { name: "Plaid", status: "pending", detail: "Detect recurring charges from transactions" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {integrations.map(i => (
        <div key={i.name} style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          padding: "16px",
          background: "var(--bg-mid)",
          border: "1px solid var(--glass-t1-border)",
          borderRadius: "var(--radius-card)",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "15px", fontWeight: 600, color: "var(--text-active)", marginBottom: "4px" }}>
              {i.name}
              <StatusBadge status={i.status} />
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.4 }}>{i.detail}</div>
          </div>
          <button style={{
            background: "var(--glass-t1-bg)",
            border: "1px solid var(--glass-t1-border)",
            borderRadius: "var(--radius-pill)",
            color: "var(--text-main)",
            fontSize: "13px",
            padding: "6px 16px",
            cursor: "pointer",
            flexShrink: 0,
            transition: "background 150ms ease, border-color 150ms ease",
          }}
            onMouseOver={e => { e.currentTarget.style.background = 'var(--glass-t2-bg)'; e.currentTarget.style.borderColor = 'var(--glass-t2-border)'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'var(--glass-t1-bg)'; e.currentTarget.style.borderColor = 'var(--glass-t1-border)'; }}
          >
            {i.status === 'ok' ? 'Manage' : 'Connect'}
          </button>
        </div>
      ))}
    </div>
  );
}

function DangerSection({ onDelete }: { onDelete: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", marginTop: "48px", paddingTop: "32px", borderTop: "1px solid var(--line-separator)" }}>
       <div style={{ marginBottom: "-8px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--tint-red)" }}>Danger Zone</h3>
          <p style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "4px", lineHeight: 1.6 }}>
            Destructive actions are irreversible. Most can be performed from the Arthur CLI.
          </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {[
          { label: "Clear session memory", desc: "Wipes ~/.arthur/data/memory.json. Learning history is lost." },
          { label: "Reset learning loop", desc: "Clears corrections.jsonl and dynamic-rules/. Classifier reverts to base constitution." },
          { label: "Purge all sessions", desc: "Drops the FTS5 session store. Full history gone." },
        ].map(action => (
          <div key={action.label} style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            padding: "16px",
            background: "var(--tint-red-soft)",
            border: "1px solid var(--tint-red)",
            borderRadius: "var(--radius-card)",
          }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-active)", marginBottom: "4px" }}>{action.label}</div>
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>{action.desc}</div>
            </div>
            <button style={{
              flexShrink: 0,
              background: "transparent",
              border: "1px solid var(--tint-red)",
              borderRadius: "var(--radius-pill)",
              color: "var(--tint-red)",
              fontSize: "13px",
              padding: "6px 16px",
              cursor: "pointer",
            }}>
              Run
            </button>
          </div>
        ))}
      </div>
      <div style={{
        padding: "16px",
        background: "var(--tint-red-soft)",
        border: "1px solid var(--tint-red)",
        borderRadius: "var(--radius-card)",
      }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-active)", marginBottom: "8px" }}>Delete account</div>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 16px" }}>
          Permanently deletes all Arthur data, sessions, credentials, and integrations. Cannot be undone.
        </p>
        <button
          onClick={onDelete}
          style={{
            background: "var(--tint-red)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-active)",
            fontSize: "14px",
            fontWeight: 600,
            padding: "10px 20px",
            cursor: "pointer",
          }}
        >
          Delete account...
        </button>
      </div>
    </div>
  );
}

function FormField({
  label, id, defaultValue, helpText, type = "text",
}: {
  label: string; id: string; defaultValue?: string; helpText?: string; type?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <label htmlFor={id} style={{
        fontSize: "12px",
        fontWeight: 500,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        defaultValue={defaultValue}
        style={{
          background: "var(--bg-mid)",
          border: "1px solid var(--glass-t1-border)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-main)",
          fontSize: "14px",
          padding: "12px 16px",
          outline: "none",
          transition: "border-color 150ms ease, box-shadow 150ms ease",
          width: "100%",
        }}
        onFocus={e => {
          e.currentTarget.style.borderColor = "var(--accent-orange)";
          e.currentTarget.style.boxShadow = `0 0 0 3px var(--accent-glow)`;
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = "var(--glass-t1-border)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
      {helpText && (
        <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
          {helpText}
        </p>
      )}
    </div>
  );
}

function SaveRow() {
  const [saved, setSaved] = useState(false);
  return (
    <div style={{ display: "flex", gap: "12px", paddingTop: "8px" }}>
      <button
        onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}
        style={{
          background: saved ? "var(--tint-emerald)" : "var(--accent-orange)",
          border: "none",
          borderRadius: "var(--radius-sm)",
          color: saved ? "var(--text-active)" : "var(--accent-text-on)",
          fontSize: "14px",
          fontWeight: 600,
          padding: "12px 24px",
          cursor: "pointer",
          transition: "background 150ms ease",
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {saved && '✓'} {saved ? "Saved" : "Save changes"}
      </button>
    </div>
  );
}

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
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(var(--glass-t3-blur))",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--tint-red)",
        borderRadius: "var(--radius-panel)",
        padding: "32px",
        width: "100%",
        maxWidth: 420,
        boxShadow: "var(--glass-t3-shadow)",
      }}>
        <div style={{
          fontSize: "12px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 600,
          color: "var(--tint-red)",
          marginBottom: "12px",
        }}>
          Danger Zone
        </div>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-active)", margin: "0 0 12px" }}>
          Delete account?
        </h2>
        <p style={{ fontSize: "14px", color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 24px" }}>
          This permanently deletes all Arthur sessions, memory, credentials, and integrations.
          Type <strong style={{ color: "var(--tint-red)", fontWeight: 700 }}>DELETE</strong> to confirm.
        </p>
        <input
          type="text"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="DELETE"
          style={{
            width: "100%",
            background: "var(--bg-mid)",
            border: "1px solid var(--glass-t1-border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--tint-red)",
            fontSize: "14px",
            padding: "12px 16px",
            outline: "none",
            marginBottom: "16px",
            letterSpacing: "0.1em",
            textAlign: "center",
          }}
        />
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            disabled={!ready}
            style={{
              flex: 1,
              background: "var(--tint-red)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-active)",
              fontSize: "14px",
              fontWeight: 600,
              padding: "12px 20px",
              cursor: ready ? "pointer" : "not-allowed",
              opacity: ready ? 1 : 0.5,
            }}
          >
            Delete permanently
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: "var(--glass-t1-bg)",
              border: "1px solid var(--glass-t1-border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-main)",
              fontSize: "14px",
              padding: "12px 20px",
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

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case "general":
        return <ProfileSection />;
      case "email":
        return <PlaceholderSection title="Email Accounts" />;
      case "notifications":
        return <PlaceholderSection title="Notifications" />;
      case "integrations":
        return <IntegrationsSection />;
      case "api":
        return <PlaceholderSection title="API" />;
      default:
        return null;
    }
  };

  return (
    <>
      <Nav />
      <main style={{ padding: `108px var(--page-gutter) 64px` }}>
        <div style={{ maxWidth: "var(--max-w-narrow)", margin: "0 auto" }}>
          {/* Header */}
          <header style={{ marginBottom: "40px" }}>
            <h1 style={{
              fontSize: "36px",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "var(--text-active)",
              margin: "0 0 8px 0",
            }}>
              Settings
            </h1>
            <p style={{ fontSize: "16px", color: "var(--text-muted)", maxWidth: "52ch", lineHeight: 1.6, margin: 0 }}>
              Configure Arthur&apos;s integrations, connected accounts, and system behavior.
            </p>
          </header>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "24px", borderBottom: "1px solid var(--line-separator)" }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: "10px 16px",
                    background: "none",
                    border: "none",
                    borderBottom: `2px solid ${isActive ? "var(--accent-orange)" : "transparent"}`,
                    color: isActive ? "var(--text-active)" : "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: isActive ? 600 : 500,
                    transition: "color 150ms ease, border-color 150ms ease",
                    marginBottom: "-1px",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Content Panel */}
          <div style={{
            background: "var(--glass-t1-bg)",
            backdropFilter: "blur(var(--glass-t1-blur))",
            border: "1px solid var(--glass-t1-border)",
            borderRadius: "var(--radius-panel)",
            padding: "32px",
            boxShadow: "var(--glass-t1-shadow)",
          }}>
            {renderContent()}
            {activeTab === "general" && <DangerSection onDelete={() => setShowDeleteModal(true)} />}
          </div>
        </div>
      </main>

      {showDeleteModal && <DeleteModal onClose={() => setShowDeleteModal(false)} />}

      <Footer />
    </>
  );
}