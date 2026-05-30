'use client';

import { useEffect, useState } from 'react';

const S = {
  bg: '#0a0a0a', bg2: '#111111', bg3: '#181818', bg4: '#1f1f1f',
  border: '#1f1f1f', border2: '#2a2a2a',
  textPrimary: '#e8e8e8', textSecondary: '#8a8a8a', textMuted: '#4a4a4a',
  accent: '#f0a500', green: '#22c55e', red: '#ef4444', orange: '#f97316', blue: '#60a5fa',
  mono: "'JetBrains Mono', monospace", sans: "'Inter', sans-serif",
};

interface Employee {
  id: string;
  name: string;
  model?: string;
  role?: string;
  team?: string;
  entity?: string;
  status?: string;
  hours_7d?: number;
  contact?: string;
  start_date?: string;
}

type Roster = Record<string, Employee[]>;

function StatBlock({ label, value, delta, valueColor }: { label: string; value: string; delta?: string; valueColor?: string }) {
  return (
    <div style={{ padding: '10px 18px', borderRight: `1px solid ${S.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: S.textMuted, fontFamily: S.mono }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: S.mono, color: valueColor || S.textPrimary }}>{value}</div>
      {delta && <div style={{ fontSize: '9px', fontFamily: S.mono, color: S.textMuted }}>{delta}</div>}
    </div>
  );
}

// Arthur AI employees from registry
const ARTHUR_TEAM: Employee[] = [
  { id: 'a1', name: 'Arthur (Haiku)', role: 'T11 Scanner', team: 'Arthur Core', entity: 'ALL', status: 'active', model: 'claude-haiku-4-5' },
  { id: 'a2', name: 'Arthur (Sonnet)', role: 'T14 Synthesis', team: 'Arthur Core', entity: 'ALL', status: 'active', model: 'claude-sonnet-4-5' },
  { id: 'a3', name: 'Arthur (Opus)', role: 'T17 Opus', team: 'Arthur Core', entity: 'ALL', status: 'standby', model: 'claude-opus-4-5' },
  { id: 'a4', name: 'Arthur OS', role: 'Accounting LoRA', team: 'Finance', entity: 'DABNEY', status: 'active', model: 'arthur-os:powerhouse' },
];

// Dabney human staff (representative)
const DABNEY_STAFF: Employee[] = [
  { id: 'h1', name: 'Daniel May', role: 'Owner / Operator', entity: 'DABNEY', status: 'active', hours_7d: 52 },
  { id: 'h2', name: 'Teo Garces', role: 'Bar Manager', entity: 'DABNEY', status: 'on-shift', hours_7d: 38 },
  { id: 'h3', name: 'Andrea Reyes', role: 'Bar Lead', entity: 'DABNEY', status: 'active', hours_7d: 32 },
  { id: 'h4', name: 'Marcus Hill', role: 'Server', entity: 'DABNEY', status: 'on-shift', hours_7d: 24 },
  { id: 'h5', name: 'Priya Nair', role: 'Server', entity: 'DABNEY', status: 'off', hours_7d: 18 },
  { id: 'h6', name: 'C. Gonzalez', role: 'Former — CC pending', entity: 'DABNEY', status: 'former', hours_7d: 0 },
];

function statusDot(status: string) {
  const map: Record<string, string> = { active: S.green, 'on-shift': S.accent, standby: S.blue, off: S.textMuted, former: S.red };
  return map[status] ?? S.textMuted;
}

export default function EmployeesPage() {
  const [roster, setRoster] = useState<Roster>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ALL 9');

  useEffect(() => {
    fetch('/api/employees')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setRoster(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const onShift = DABNEY_STAFF.filter(e => e.status === 'on-shift').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: S.bg2, borderBottom: `1px solid ${S.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: '12px', fontWeight: 700, color: S.textPrimary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>EMPLOYEES</div>
          <div style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, letterSpacing: '0.08em' }}>HUMAN + ARTHUR AGENTS · HOMEBASE SYNC LIVE</div>
        </div>
        <div style={{ display: 'flex', gap: '3px', marginLeft: '14px' }}>
          {['ALL 9', 'MANAGERS 4', 'SERVERS 3', 'ON-CALL 1', 'ARTHUR', 'FORMER 1'].map(label => (
            <button key={label} onClick={() => setTab(label)} style={{ padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: tab === label ? S.accent : S.bg3, color: tab === label ? S.bg : S.textMuted, border: `1px solid ${tab === label ? S.accent : S.border2}`, cursor: 'pointer', fontWeight: 600 }}>{label}</button>
          ))}
        </div>
        <button style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: 'transparent', color: S.accent, border: `1px solid ${S.accent}44`, cursor: 'pointer', fontWeight: 600 }}>+ HIRE</button>
      </div>

      {/* Stat bar */}
      <div style={{ background: S.bg3, borderBottom: `1px solid ${S.border}`, display: 'flex', overflowX: 'auto', flexShrink: 0 }}>
        <StatBlock label="ON SHIFT NOW" value={String(onShift)} delta="2 closing tonight" valueColor={S.green} />
        <StatBlock label="PAYROLL / MTD" value="$2,871" delta="42 hrs avg/wk" />
        <StatBlock label="OPEN SHIFTS / 7D" value="3" delta="2 unfilled Sat night" valueColor={S.orange} />
        <StatBlock label="NEW HIRES / 30D" value="1" delta="Andrea (Bar Lead)" />
        <StatBlock label="TURNOVER / 90D" value="1" delta="Gonzalez — CC unset" valueColor={S.red} />
        <StatBlock label="ARTHUR AGENTS" value={String(ARTHUR_TEAM.filter(a => a.status === 'active').length)} delta="active this session" valueColor={S.blue} />
      </div>

      {/* 2-col: human + agents */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1px', background: S.border, minHeight: 0, overflow: 'hidden' }}>
        {/* Human staff table */}
        <div style={{ background: S.bg, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: S.bg2 }}>
                {['NAME', 'ROLE', 'ENTITY', 'CONTACT', 'HOURS / 7D', 'STATUS'].map(h => (
                  <th key={h} style={{ fontFamily: S.mono, fontSize: '8px', fontWeight: 700, letterSpacing: '0.1em', color: S.textMuted, padding: '7px 16px', textAlign: 'left', borderBottom: `1px solid ${S.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Section header */}
              <tr>
                <td colSpan={6} style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, color: S.textMuted, padding: '6px 16px', background: S.bg2, letterSpacing: '0.1em', borderBottom: `1px solid ${S.border}` }}>DABNEY & CO. STAFF</td>
              </tr>
              {DABNEY_STAFF.map(emp => (
                <tr key={emp.id} style={{ borderBottom: `1px solid ${S.border}`, opacity: emp.status === 'former' ? 0.5 : 1 }}>
                  <td style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusDot(emp.status ?? 'off'), flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: '12px', fontWeight: 500, color: S.textPrimary }}>{emp.name}</span>
                  </td>
                  <td style={{ fontSize: '11px', color: S.textSecondary, padding: '10px 16px' }}>{emp.role}</td>
                  <td style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, padding: '10px 16px' }}>DABNEY</td>
                  <td style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, padding: '10px 16px' }}>—</td>
                  <td style={{ fontFamily: S.mono, fontSize: '12px', fontWeight: 700, color: (emp.hours_7d ?? 0) > 35 ? S.orange : S.textPrimary, padding: '10px 16px' }}>{emp.hours_7d ?? 0}h</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '2px', background: emp.status === 'on-shift' ? 'rgba(240,165,0,0.1)' : emp.status === 'former' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.07)', color: emp.status === 'on-shift' ? S.accent : emp.status === 'former' ? S.red : S.green, border: `1px solid ${emp.status === 'on-shift' ? 'rgba(240,165,0,0.25)' : emp.status === 'former' ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}` }}>
                      {emp.status?.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Arthur agents panel */}
        <div style={{ background: S.bg2, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${S.border}`, fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted }}>ARTHUR AGENTS</div>
          <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {ARTHUR_TEAM.map(agent => (
              <div key={agent.id} style={{ background: S.bg3, border: `1px solid ${S.border2}`, borderRadius: '3px', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: S.textPrimary }}>{agent.name}</div>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusDot(agent.status ?? 'off'), display: 'inline-block' }} />
                </div>
                <div style={{ fontSize: '10px', color: S.textSecondary, marginBottom: '3px' }}>{agent.role}</div>
                <div style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted }}>{agent.model}</div>
              </div>
            ))}
          </div>
          {/* Roster from API if available */}
          {Object.keys(roster).length > 0 && (
            <div style={{ padding: '10px 14px', borderTop: `1px solid ${S.border}` }}>
              <div style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, color: S.textMuted, marginBottom: '8px' }}>SPECIALIST REGISTRY</div>
              {Object.entries(roster).slice(0, 5).map(([team, members]) => (
                <div key={team} style={{ marginBottom: '6px' }}>
                  <div style={{ fontFamily: S.mono, fontSize: '8px', color: S.textMuted, marginBottom: '3px' }}>{team.toUpperCase()}</div>
                  {(members as Employee[]).slice(0, 2).map(m => (
                    <div key={m.id} style={{ fontSize: '10px', color: S.textSecondary, padding: '2px 0' }}>{m.name}</div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
