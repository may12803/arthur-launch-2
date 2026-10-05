// Turns a verified Stripe checkout event into an audit. Kept free of Next and the Stripe SDK so it runs under the node
// test runner: the route injects the Stripe reads (line items, customer lookup) and the store.
import { resolveLookupKey } from '../billing/plans.ts';
import type { AuditStore } from './store.ts';

export const AUDIT_EVENT_TYPES = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SessionLike {
  id: string;
  mode: string | null;
  payment_status?: string | null;
  payment_intent?: string | { id: string } | null;
  amount_total?: number | null;
  currency?: string | null;
  livemode?: boolean;
  client_reference_id?: string | null;
  customer?: string | { id: string } | null;
  metadata?: Record<string, string> | null;
}
export interface EventLike { id: string; type: string; created: number; livemode: boolean; data: { object: unknown } }

export interface PurchaseDeps {
  store: AuditStore;
  /** Price lookup key of the session's line item, read from Stripe; null when it has none. */
  lineItemLookup: (sessionId: string) => Promise<string | null>;
  tenantForCustomer: (customerId: string) => Promise<string | null>;
  /** Called after the purchase is recorded. Returns the pending generation so the route can let it finish after replying. */
  generate: (auditId: string) => Promise<unknown>;
}

export interface PurchaseResult {
  handled: boolean;
  ignored?: string;
  auditId?: string;
  created?: boolean;
  generation?: Promise<unknown>;
}

/** The audit lookup key for a session, or null when the session is not an audit purchase. Line item wins over metadata. */
export async function auditLookupKey(s: SessionLike, lineItemLookup: PurchaseDeps['lineItemLookup']): Promise<string | null> {
  const fromStripe = await lineItemLookup(s.id);
  const key = fromStripe ?? s.metadata?.price_lookup_key ?? null;
  if (!key) return null;
  const r = resolveLookupKey(key);
  return r && r.mode === 'payment' && key.startsWith('ll_audit_') ? key : null;
}

export async function handleAuditCheckoutEvent(event: EventLike, deps: PurchaseDeps): Promise<PurchaseResult> {
  if (!(AUDIT_EVENT_TYPES as readonly string[]).includes(event.type)) return { handled: false, ignored: 'not a checkout event' };
  const s = event.data.object as SessionLike;
  if (s.mode !== 'payment') return { handled: false, ignored: 'not a one-time payment' };
  if (s.payment_status !== 'paid') return { handled: false, ignored: 'not paid yet' };
  const lookupKey = await auditLookupKey(s, deps.lineItemLookup);
  if (!lookupKey) return { handled: false, ignored: 'not an audit purchase' };

  const customer = typeof s.customer === 'string' ? s.customer : s.customer?.id ?? null;
  const metaTenant = s.metadata?.tenant_id ?? null;
  if (metaTenant && s.client_reference_id && s.client_reference_id !== metaTenant) return { handled: false, ignored: 'tenant references disagree' };
  const tenantId = metaTenant ?? s.client_reference_id ?? (customer ? await deps.tenantForCustomer(customer) : null);
  if (!tenantId || !UUID.test(tenantId)) return { handled: false, ignored: 'no tenant on the session' };

  const rec = await deps.store.recordPurchase({
    eventId: event.id, eventType: event.type, eventCreated: new Date(event.created * 1000).toISOString(), tenantId, sessionId: s.id,
    paymentIntent: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null, lookupKey,
    amountCents: s.amount_total ?? null, currency: s.currency ?? null, livemode: event.livemode,
  });
  return { handled: true, auditId: rec.audit_id, created: rec.created, generation: deps.generate(rec.audit_id) };
}
