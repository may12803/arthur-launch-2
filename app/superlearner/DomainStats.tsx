'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Loader2, AlertTriangle, ChevronDown } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

// Types
interface HardCase {
  id: string;
  from?: string | null;
  subject?: string | null;
  predicted?: string | null;
  correct: string;
}

interface DomainStatsData {
  domain: string;
  total_decisions: number;
  total_corrections: number;
  accuracy_7d: number | null;
  accuracy_30d: number | null;
  hard_cases: HardCase[];
}

const DOMAIN_LABELS: Record<string, string> = {
  inbox:          "Inbox Triage",
  invoice:        "Invoice Detection",
  unsubscribe:    "Unsubscribe Classifier",
  calendar_invite:"Calendar Invites",
  reply_draft:    "Reply Drafts",
};

// Main Component
export default function DomainStats() {
  const [stats, setStats] = useState<DomainStatsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data, error } = await supabase.rpc('get_superlearner_stats');
        if (error) throw error;
        setStats(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

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
        <AlertTriangle className="mr-2 h-5 w-5" />
        <p>Error loading stats: {error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6 text-text-active">Superlearner Stats</h1>
      <div className="space-y-4">
        {stats.map(domain => (
          <DomainCard key={domain.domain} domain={domain} />
        ))}
      </div>
    </div>
  );
}

// Domain Card Component
function DomainCard({ domain }: { domain: DomainStatsData }) {
  return (
    <div className="bg-glass-bg border border-glass-border rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-text-active">{DOMAIN_LABELS[domain.domain] || domain.domain}</h2>
        <div className="flex items-center space-x-4">
          <AccuracyStat label="7d" value={domain.accuracy_7d} />
          <AccuracyStat label="30d" value={domain.accuracy_30d} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <StatBox label="Total Decisions" value={domain.total_decisions} />
        <StatBox label="Total Corrections" value={domain.total_corrections} />
      </div>
      
      {domain.hard_cases && domain.hard_cases.length > 0 && (
        <Accordion type="single" collapsible>
          <AccordionItem value="hard-cases" className="border-none">
            <AccordionTrigger className="text-sm text-text-muted hover:no-underline">
              {domain.hard_cases.length} Hard Cases
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {domain.hard_cases.map(hc => <HardCaseItem key={hc.id} hardCase={hc} />)}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

function AccuracyStat({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  const color = pct >= 95 ? 'text-green-400' : pct >= 85 ? 'text-yellow-400' : 'text-red-400';
  return (
    <div className="text-center">
      <p className="text-xs text-text-muted uppercase">{label}</p>
      <p className={`text-2xl font-mono font-semibold ${color}`}>{pct}%</p>
    </div>
  );
}

function StatBox({ label, value }: { label: string, value: number }) {
  return (
    <div className="bg-glass-border/50 p-4 rounded-md">
      <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-semibold font-mono text-text-active">{value.toLocaleString()}</p>
    </div>
  )
}

function HardCaseItem({ hardCase }: { hardCase: HardCase }) {
  return (
    <div className="bg-glass-border/50 p-3 rounded-md text-sm">
      <p className="font-semibold text-text-active truncate">{hardCase.subject || 'No Subject'}</p>
      <p className="text-xs text-text-muted mb-2 truncate">{hardCase.from || 'Unknown Sender'}</p>
      <div className="flex items-center space-x-2">
        <Badge variant="destructive" className="font-mono">{hardCase.predicted || 'N/A'}</Badge>
        <span className="text-text-muted">→</span>
        <Badge variant="secondary" className="font-mono bg-green-500/20 text-green-300">{hardCase.correct}</Badge>
      </div>
    </div>
  )
}
