"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── CommandBar — global Cmd+K palette ─────────────────────────────────────────
// Trigger: Cmd+K (or Ctrl+K on Windows/Linux)
// Also exported: useCommandBar() hook so any button can open it
// Search: fuzzy-matches across routes, actions, and a fallback "ask Arthur" entry
// Groups results by section, shows keyboard hint, closes on Escape / click outside

export const CommandBarContext = React.createContext<{
  open: () => void;
  close: () => void;
}>({ open: () => {}, close: () => {} });

export function useCommandBar() {
  return React.useContext(CommandBarContext);
}

// ── Data ────────────────────────────────────────────────────────────────────

type CommandEntry = {
  id: string;
  label: string;
  group: string;
  href?: string;
  action?: () => void;
  keywords?: string[];
  shortcut?: string;
};

const STATIC_COMMANDS: CommandEntry[] = [
  { id: "nav-dash",      label: "Dashboard",         group: "Navigate", href: "/dashboard",      keywords: ["chat", "home"] },
  { id: "nav-inbox",     label: "Inbox",              group: "Navigate", href: "/inbox",          keywords: ["email", "mail", "messages"] },
  { id: "nav-calendar",  label: "Calendar",           group: "Navigate", href: "/calendar",       keywords: ["schedule", "events"] },
  { id: "nav-goals",     label: "Goals",              group: "Navigate", href: "/goals",          keywords: ["objectives", "okr"] },
  { id: "nav-legal",     label: "Legal",              group: "Navigate", href: "/legal",          keywords: ["contracts", "law", "documents"] },
  { id: "nav-skills",    label: "Skills",             group: "Navigate", href: "/skills",         keywords: ["learning", "abilities"] },
  { id: "nav-brain",     label: "Brain",              group: "Navigate", href: "/brain",          keywords: ["memory", "knowledge"] },
  { id: "nav-graph",     label: "Graph",              group: "Navigate", href: "/graph",          keywords: ["network", "connections"] },
  { id: "nav-principles",label: "Principles",         group: "Navigate", href: "/principles",     keywords: ["values", "ethics"] },
  { id: "nav-superlearner", label: "Superlearner",    group: "Navigate", href: "/superlearner",   keywords: ["study", "flashcards"] },
  { id: "nav-messenger", label: "Messenger",          group: "Navigate", href: "/messenger",      keywords: ["sms", "voice", "text"] },
  { id: "nav-comms",     label: "Communications",     group: "Navigate", href: "/communications", keywords: ["phone", "fax"] },
  { id: "nav-subs",      label: "Subscriptions",      group: "Navigate", href: "/subscriptions",  keywords: ["billing", "plans"] },
  { id: "nav-settings",  label: "Settings",           group: "Navigate", href: "/settings/email", keywords: ["config", "preferences"] },
  { id: "nav-iphone",    label: "iPhone",             group: "Navigate", href: "/iphone",         keywords: ["mobile", "phone"] },
  { id: "nav-benchmarks", label: "Benchmarks",        group: "Navigate", href: "/benchmarks",     keywords: ["performance", "metrics"] },
];

// ── fuzzy search ──────────────────────────────────────────────────────────────

function fuzzyScore(query: string, entry: CommandEntry): number {
  const q = query.toLowerCase();
  const label = entry.label.toLowerCase();
  const keywords = (entry.keywords || []).join(" ").toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (keywords.includes(q)) return 40;
  // character-level fuzzy
  let score = 0;
  let qi = 0;
  for (let i = 0; i < label.length && qi < q.length; i++) {
    if (label[i] === q[qi]) { score += 5; qi++; }
  }
  return qi === q.length ? score : 0;
}

// ── CommandBarProvider ────────────────────────────────────────────────────────

export function CommandBarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Cmd+K global shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandBarContext.Provider value={{ open, close }}>
      {children}
      {isOpen && <CommandBarModal onClose={close} />}
    </CommandBarContext.Provider>
  );
}

// ── CommandBarModal ───────────────────────────────────────────────────────────

function CommandBarModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Filtered + scored results
  const results: CommandEntry[] = query.trim()
    ? STATIC_COMMANDS
        .map((e) => ({ entry: e, score: fuzzyScore(query, e) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.entry)
    : STATIC_COMMANDS.slice(0, 8);

  // "Ask Arthur" always appended when query exists
  const askEntry: CommandEntry | null = query.trim()
    ? {
        id: "ask-arthur",
        label: `Ask Arthur: "${query}"`,
        group: "AI",
        href: `/dashboard?q=${encodeURIComponent(query)}`,
      }
    : null;

  const all = askEntry ? [...results, askEntry] : results;

  // Keyboard nav
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, all.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = all[activeIdx];
      if (item) execute(item);
    }
  }

  function execute(item: CommandEntry) {
    onClose();
    if (item.action) item.action();
    else if (item.href) router.push(item.href);
  }

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  // Reset active on results change
  useEffect(() => { setActiveIdx(0); }, [query]);

  // Group results
  const groups: Record<string, CommandEntry[]> = {};
  for (const entry of all) {
    if (!groups[entry.group]) groups[entry.group] = [];
    groups[entry.group].push(entry);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 399,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal
        aria-label="command bar"
        style={{
          position: "fixed",
          top: "20vh",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 400,
          width: "min(90vw, 560px)",
          background: "rgba(14, 16, 22, 0.98)",
          backdropFilter: "blur(32px)",
          WebkitBackdropFilter: "blur(32px)",
          border: "1px solid var(--glass-border-tier2)",
          borderRadius: 16,
          boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Search input row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid var(--glass-border)",
          }}
        >
          <span style={{ color: "var(--text-muted)", fontSize: 16, flexShrink: 0 }}>
            ⌕
          </span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search or ask Arthur…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-active)",
              fontSize: 16,
              lineHeight: "1.5",
              fontFamily: "inherit",
            }}
          />
          <kbd
            style={{
              padding: "2px 6px",
              borderRadius: 5,
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
              fontSize: 11,
              color: "var(--text-muted)",
              flexShrink: 0,
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <ul
          ref={listRef}
          role="listbox"
          style={{
            listStyle: "none",
            margin: 0,
            padding: "8px 0",
            maxHeight: "50vh",
            overflowY: "auto",
          }}
        >
          {all.length === 0 && (
            <li style={{ padding: "20px 20px", color: "var(--text-muted)", fontSize: 14 }}>
              No results
            </li>
          )}
          {Object.entries(groups).map(([group, items]) => (
            <React.Fragment key={group}>
              <li
                aria-hidden
                style={{
                  padding: "8px 16px 4px",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {group}
              </li>
              {items.map((item) => {
                const globalIdx = all.indexOf(item);
                const isActive = globalIdx === activeIdx;
                return (
                  <li
                    key={item.id}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => execute(item)}
                    onMouseEnter={() => setActiveIdx(globalIdx)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "10px 16px",
                      cursor: "pointer",
                      background: isActive
                        ? "var(--glass-bg-tier2)"
                        : "transparent",
                      color: isActive
                        ? "var(--text-active)"
                        : "var(--text-main)",
                      fontSize: 14,
                      borderLeft: isActive
                        ? "2px solid var(--accent-orange)"
                        : "2px solid transparent",
                      transition: "background 0.08s, color 0.08s",
                    }}
                  >
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.shortcut && (
                      <kbd
                        style={{
                          padding: "2px 6px",
                          borderRadius: 5,
                          background: "var(--glass-bg)",
                          border: "1px solid var(--glass-border)",
                          fontSize: 11,
                          color: "var(--text-muted)",
                        }}
                      >
                        {item.shortcut}
                      </kbd>
                    )}
                  </li>
                );
              })}
            </React.Fragment>
          ))}
        </ul>

        {/* Footer hint */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--glass-border)",
            display: "flex",
            gap: 16,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          <span><kbd style={{ fontSize: 11 }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ fontSize: 11 }}>↵</kbd> open</span>
          <span><kbd style={{ fontSize: 11 }}>esc</kbd> close</span>
        </div>
      </div>
    </>
  );
}

export default CommandBarProvider;
