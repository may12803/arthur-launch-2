'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Search, Loader2 } from 'lucide-react';
import EmailDetail from './EmailDetail';

// Types
interface EmailRow {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
  received_at: string;
  is_read: boolean;
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
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function preview(text: string | null, len = 60): string {
  if (!text) return '';
  const clean = text.replace(/\\s+/g, ' ').trim();
  return clean.length > len ? clean.slice(0, len) + '…' : clean;
}

// Main Component
export default function EmailList() {
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailRow | null>(null);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('arthur_inbox_emails')
        .select('id, from_email, from_name, subject, body_text, received_at, is_read')
        .eq('direction', 'inbound')
        .eq('is_deleted', false)
        .eq('is_archived', false)
        .order('received_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setEmails(data as EmailRow[] || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  useEffect(() => {
    if (emails.length > 0 && !selectedEmail) {
      setSelectedEmail(emails[0]);
    }
  }, [emails, selectedEmail]);

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
          {emails.map((email) => (
            <EmailListItem
              key={email.id}
              email={email}
              isSelected={selectedEmail?.id === email.id}
              onClick={() => setSelectedEmail(email)}
            />
          ))}
        </div>
      </div>
      <div className="col-span-1 md:col-span-2 xl:col-span-3">
        {selectedEmail && <EmailDetail emailId={selectedEmail.id} />}
      </div>
    </div>
  );
}

// List Item Component
function EmailListItem({ email, isSelected, onClick }: { email: EmailRow; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg mb-2 transition-colors',
        isSelected ? 'bg-glass-border' : 'hover:bg-glass-border/50',
        !email.is_read && 'font-semibold'
      )}
    >
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm text-text-active truncate">{email.from_name || email.from_email}</span>
        <span className="text-xs text-text-muted flex-shrink-0 ml-2">{relTime(email.received_at)}</span>
      </div>
      <p className={cn('text-sm truncate', !email.is_read ? 'text-text-active' : 'text-text-muted')}>
        {email.subject}
      </p>
      <p className="text-xs text-text-muted truncate">{preview(email.body_text, 100)}</p>
    </button>
  );
}
