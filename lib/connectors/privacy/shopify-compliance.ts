import { createHmac, timingSafeEqual } from 'node:crypto';

// Shopify mandatory compliance webhooks (customers/data_request, customers/redact, shop/redact).
// Docs: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
// Every request carries X-Shopify-Hmac-Sha256 = base64(HMAC-SHA256(raw body, app client secret)). A bad or missing HMAC is a 401.

export type ShopifyTopic = 'customers/data_request' | 'customers/redact' | 'shop/redact';
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error: { message: string } | null }>;

export function verifyShopifyHmac(rawBody: string, header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  let given: Buffer;
  try {
    given = Buffer.from(header, 'base64');
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export interface ComplianceInput {
  topic: ShopifyTopic;
  rawBody: string;
  hmacHeader: string | null | undefined;
  secret: string | undefined;
  serverSecret: string | null;
  rpc: Rpc;
  /** Respond 200 after this long even if the database call is still running (Shopify allows 5s). */
  deadlineMs?: number;
  log?: (msg: string) => void;
}

export interface ComplianceResult {
  status: number;
  body: Record<string, unknown>;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length ? v : v != null && typeof v !== 'object' ? String(v) : null);

export async function handleShopifyCompliance(i: ComplianceInput): Promise<ComplianceResult> {
  const log = i.log ?? ((m: string) => console.log(m));
  if (!i.secret) return { status: 503, body: { error: 'Not configured.' } };
  if (!verifyShopifyHmac(i.rawBody, i.hmacHeader, i.secret)) return { status: 401, body: { error: 'Invalid signature.' } };
  if (!i.serverSecret) return { status: 503, body: { error: 'Not configured.' } };

  let p: any;
  try {
    p = JSON.parse(i.rawBody);
  } catch {
    return { status: 400, body: { error: 'Invalid JSON.' } };
  }
  const shop = String(p?.shop_domain ?? '').toLowerCase();
  if (!SHOP_RE.test(shop)) return { status: 400, body: { error: 'Invalid shop.' } };

  let work: ReturnType<Rpc>;
  if (i.topic === 'shop/redact') {
    work = i.rpc('shopify_shop_redact', { p_secret: i.serverSecret, p_shop: shop });
  } else if (i.topic === 'customers/redact') {
    work = i.rpc('shopify_customer_redact', {
      p_secret: i.serverSecret,
      p_shop: shop,
      p_customer_id: str(p?.customer?.id),
      p_email: str(p?.customer?.email),
      p_order_ids: Array.isArray(p?.orders_to_redact) ? p.orders_to_redact.map((x: unknown) => String(x)) : [],
    });
  } else {
    // data_request: record the request (ids only, not the customer's contact details) as a task for a person to fulfil.
    work = i.rpc('compliance_request_log', {
      p_secret: i.serverSecret,
      p_source: 'shopify',
      p_topic: i.topic,
      p_shop: shop,
      p_payload: { shop_id: p?.shop_id ?? null, customer_id: str(p?.customer?.id), orders_requested: p?.orders_requested ?? [], data_request_id: p?.data_request?.id ?? null },
    });
  }

  const TIMEOUT = Symbol('timeout');
  const tracked = work.then(
    (r) => {
      if (r.error) log(`[shopify-compliance] ${i.topic} failed: ${r.error.message.slice(0, 120)}`);
      return r;
    },
    (e) => {
      const message = e instanceof Error ? e.message : 'error';
      log(`[shopify-compliance] ${i.topic} failed: ${message.slice(0, 120)}`);
      return { error: { message } } as { error: { message: string } };
    },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const raced = await Promise.race([tracked, new Promise<typeof TIMEOUT>((r) => { timer = setTimeout(() => r(TIMEOUT), i.deadlineMs ?? 3000); })]);
  if (timer) clearTimeout(timer);
  // Past the deadline we answer 200 and let the work finish; a failure inside the deadline is a 500 so Shopify retries.
  if (raced !== TIMEOUT && (raced as { error: unknown }).error) return { status: 500, body: { error: 'Could not process the request.' } };
  return { status: 200, body: { ok: true } };
}
