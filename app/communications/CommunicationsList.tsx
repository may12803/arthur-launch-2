'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
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

  return (
    <div className="flex-grow grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 h-full">
      <div className="col-span-1 md:col-span-1 xl:col-span-1 bg-glass-bg border-r border-glass-border p-4 flex flex-col">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-10 pr-4 py-2 bg-transparent border border-glass-border rounded-lg text-sm"
          />
        </div>
        <div className="flex-grow overflow-y-auto">
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
      <div className="col-span-1 md:col-span-2 xl:col-span-3">
        {selectedComm && <CommunicationDetail comm={selectedComm} />}
      </div>
    </div>
  );
}

// List Item Component
function CommListItem({ comm, isSelected, onClick }: { comm: CommRow; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg mb-2 transition-colors',
        isSelected ? 'bg-glass-border' : 'hover:bg-glass-border/50'
      )}
    >
      <div className="flex justify-between items-center mb-1">
        <span className="font-medium text-sm text-text-active">{comm.from_address}</span>
        <span className="text-xs text-text-muted">{relTime(comm.ts)}</span>
      </div>
      <p className="text-sm text-text-muted truncate">{preview(comm.body, 100)}</p>
    </button>
  );
}
