'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Search, Loader2 } from 'lucide-react';
import CommunicationDetail from './CommunicationDetail';

// Types
export interface CommRow {
  id: string;
  ts: string;
  channel: 'sms' | 'voice' | 'fax' | 'email';
  direction: 'inbound' | 'outbound';
  from_address: string;
  to_address: string;
  subject: string | null;
  body: string | null;
  attachment_url: string | null;
  status: string;
  external_id: string | null;
  cost_cents: number | null;
  metadata: Record<string, unknown>;
  entity: string | null;
  category: string | null;
  related_to: string | null;
  created_at: string;
}

// Helpers
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function preview(text: string | null, len = 60): string {
  if (!text) return '';
  const clean = text.replace(/\\n/g, ' ').trim();
  return clean.length > len ? clean.slice(0, len) + '…' : clean;
}

// Main Component
export default function CommunicationsList() {
  const [rows, setRows] = useState<CommRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedComm, setSelectedComm] = useState<CommRow | null>(null);

  const fetchComms = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('arthur_communications')
        .select('*')
        .order('ts', { ascending: false })
        .limit(200);

      if (error) throw error;
      setRows(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComms();
  }, [fetchComms]);

  useEffect(() => {
    if (rows.length > 0 && !selectedComm) {
      setSelectedComm(rows[0]);
    }
  }, [rows, selectedComm]);

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-grow flex items-center justify-center text-red-500">
        Error: {error}
      </div>
    );
  }

  const GLASS = 'rgba(255,255,255,0.04)';
  const GLASS_BORDER = 'rgba(255,255,255,0.08)';
  const SEP = 'rgba(255,255,255,0.06)';
  const TEXT = '#f5f6f8';
  const TEXT_MUTED = 'rgba(245,246,248,0.50)';
  const MONO = "'JetBrains Mono','GeistMono',monospace";

  return (
    <div style={{ display: 'flex', flexGrow: 1, height: '100%', overflow: 'hidden', background: '#0c0e12' }}>
      {/* List pane */}
      <div style={{ width: 280, minWidth: 240, borderRight: `1px solid ${SEP}`, display: 'flex', flexDirection: 'column', background: GLASS, flexShrink: 0, backdropFilter: 'blur(16px)' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${SEP}`, flexShrink: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: TEXT_MUTED, marginBottom: 10 }}>
            Communications
          </div>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: TEXT_MUTED }} />
            <input
              type="text"
              placeholder="Search…"
              style={{ width: '100%', paddingLeft: 30, paddingRight: 12, paddingTop: 7, paddingBottom: 7, background: 'rgba(255,255,255,0.06)', border: `1px solid ${GLASS_BORDER}`, borderRadius: 8, fontSize: 13, color: TEXT, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {rows.map((row) => (
            <CommListItem
              key={row.id}
              comm={row}
              isSelected={selectedComm?.id === row.id}
              onClick={() => setSelectedComm(row)}
            />
          ))}
        </div>
      </div>
      {/* Detail pane */}
      <div style={{ flex: 1, minWidth: 0, background: '#0c0e12', overflow: 'auto' }}>
        {selectedComm && <CommunicationDetail comm={selectedComm} />}
      </div>
    </div>
  );
}

// List Item Component
function CommListItem({ comm, isSelected, onClick }: { comm: CommRow; isSelected: boolean; onClick: () => void }) {
  const channelColors: Record<string, string> = {
    sms: 'rgba(52,211,153,0.85)', voice: 'rgba(91,141,239,0.90)',
    fax: 'rgba(251,191,36,0.85)', email: 'rgba(167,139,250,0.90)'
  };
  const channelBg: Record<string, string> = {
    sms: 'rgba(52,211,153,0.12)', voice: 'rgba(91,141,239,0.12)',
    fax: 'rgba(251,191,36,0.12)', email: 'rgba(167,139,250,0.12)'
  };
  const MONO = "'JetBrains Mono','GeistMono',monospace";

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '13px 18px', cursor: 'pointer',
        background: isSelected ? 'rgba(212,255,61,0.08)' : 'transparent',
        border: 'none',
        borderLeft: isSelected ? '2px solid #d4ff3d' : '2px solid transparent',
        boxShadow: '0 1px 0 rgba(255,255,255,0.05)',
        transition: 'background 120ms ease', display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#f5f6f8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {comm.from_address}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(245,246,248,0.30)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{relTime(comm.ts)}</span>
      </div>
      <p style={{ fontSize: 12, color: 'rgba(245,246,248,0.50)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {preview(comm.body, 80)}
      </p>
      <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: channelColors[comm.channel] ?? 'rgba(245,246,248,0.30)', background: channelBg[comm.channel] ?? 'rgba(255,255,255,0.04)', padding: '1.5px 6px', borderRadius: 4, alignSelf: 'flex-start' }}>
        {comm.channel}
      </span>
    </button>
  );
}
