'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

interface EmailFull {
  id: string;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  received_at: string;
}

export default function EmailDetail({ emailId }: { emailId: string }) {
  const [email, setEmail] = useState<EmailFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmail = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('arthur_emails')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      setEmail(data as EmailFull);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmail(emailId);
  }, [emailId, fetchEmail]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error || !email) {
    return (
      <div className="h-full flex items-center justify-center text-red-500">
        Error: {error || 'Email not found.'}
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="pb-4 border-b border-glass-border mb-4">
        <h2 className="text-xl font-semibold text-text-active">{email.subject || 'No Subject'}</h2>
        <div className="flex items-center text-sm text-text-muted mt-1">
          <span>From: {email.from_name} &lt;{email.from_email}&gt;</span>
          <span className="mx-2">|</span>
          <span>To: {email.to_email}</span>
        </div>
        <span className="text-xs text-text-muted">{new Date(email.received_at).toLocaleString()}</span>
      </div>
      <div className="flex-grow overflow-y-auto">
        {email.body_html ? (
          <iframe
            srcDoc={email.body_html}
            className="w-full h-full border-none"
            sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
          />
        ) : (
          <div className="prose prose-invert max-w-none whitespace-pre-wrap">
            {email.body_text}
          </div>
        )}
      </div>
    </div>
  );
}
