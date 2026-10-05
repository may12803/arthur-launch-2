// Server-side persistence for audits. Every write and every read of a customer's uploaded file goes through the
// audit_* RPCs, which the database guards with the connectors server secret (private.server_ok_named). The portal's
// own reads use the signed-in session under RLS and never come through here.
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface PurchaseInput {
  eventId: string;
  eventType: string;
  eventCreated: string;
  tenantId: string;
  sessionId: string;
  paymentIntent: string | null;
  lookupKey: string;
  amountCents: number | null;
  currency: string | null;
  livemode: boolean;
}

export interface AuditJob { id: string; tenant_id: string; offer_key: string; record_limit: number; created_at: string; attempts: number }
export interface DocMeta { id: string; name: string; content_type: string; size_bytes: number; created_at: string }

export interface SaveInput {
  auditId: string;
  status: 'ready' | 'needs_data' | 'failed';
  reason: string | null;
  documentId: string | null;
  filename: string | null;
  asOf: string | null;
  score: number | null;
  lossTotal: number | null;
  headline: string | null;
  result: unknown;
  version: number;
}

export interface AuditStore {
  recordPurchase(p: PurchaseInput): Promise<{ audit_id: string; created: boolean }>;
  claim(auditId: string): Promise<AuditJob | null>;
  listDocuments(tenantId: string): Promise<DocMeta[]>;
  readDocument(tenantId: string, documentId: string): Promise<Buffer | null>;
  save(s: SaveInput): Promise<boolean>;
  pending(limit: number, tenantId?: string): Promise<string[]>;
}

export class SupabaseAuditStore implements AuditStore {
  private db: RpcClient;
  private secret: string;
  constructor(db: RpcClient, secret: string) { this.db = db; this.secret = secret; }

  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const r = await this.db.rpc(fn, { p_secret: this.secret, ...args });
    if (r.error) throw new Error(`${fn}: ${r.error.message}`);
    return r.data as T;
  }

  recordPurchase(p: PurchaseInput) {
    return this.call<{ audit_id: string; created: boolean }>('audit_record_purchase', {
      p_event_id: p.eventId, p_event_type: p.eventType, p_event_created: p.eventCreated, p_tenant: p.tenantId, p_session: p.sessionId,
      p_payment_intent: p.paymentIntent, p_lookup_key: p.lookupKey, p_amount_cents: p.amountCents, p_currency: p.currency, p_livemode: p.livemode,
    });
  }
  claim(auditId: string) { return this.call<AuditJob | null>('audit_claim', { p_audit: auditId }); }
  async listDocuments(tenantId: string) { return (await this.call<DocMeta[] | null>('audit_input_documents', { p_tenant: tenantId, p_limit: 10 })) ?? []; }
  async readDocument(tenantId: string, documentId: string) {
    const b64 = await this.call<string | null>('audit_input_document', { p_tenant: tenantId, p_doc: documentId });
    return b64 ? Buffer.from(b64, 'base64') : null;
  }
  async save(s: SaveInput) {
    return Boolean(await this.call<boolean>('audit_save', {
      p_audit: s.auditId, p_status: s.status, p_reason: s.reason, p_document: s.documentId, p_filename: s.filename, p_as_of: s.asOf, p_score: s.score,
      p_loss: s.lossTotal, p_headline: s.headline, p_result: s.result, p_version: s.version,
    }));
  }
  async pending(limit: number, tenantId?: string) { return (await this.call<string[] | null>('audit_pending', { p_limit: limit, p_tenant: tenantId ?? null })) ?? []; }
}
