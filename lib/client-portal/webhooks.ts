import { createHmac } from "node:crypto";
import { safeFetch, type Resolver } from "../connectors/net/safe-url.ts";

export type WebhookPayload = { id: string; type: string; tenant: string; created_at: string; data: unknown };
export type Delivery = { id: string; url: string; secret: string; payload: WebhookPayload; attempt: number };
export type DeliveryResult = { status: "delivered" | "retry" | "failed"; response_code: number | null; attempt: number; next_at: string | null };
export type DeliveryStore = { record: (id: string, result: DeliveryResult) => Promise<void> };
export const BACKOFF_SECONDS = [60, 300, 1800, 7200, 43200];

export function signature(secret: string, body: string, unix: number): string {
  const hex = createHmac("sha256", secret).update(`${unix}.${body}`).digest("hex");
  return `t=${unix},v1=${hex}`;
}

export async function deliverWebhook(delivery: Delivery, store: DeliveryStore, options: { fetch?: typeof fetch; resolve?: Resolver; now?: Date } = {}): Promise<DeliveryResult> {
  const now = options.now ?? new Date();
  const body = JSON.stringify(delivery.payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let response_code: number | null = null;
  try {
    const response = await safeFetch(options.fetch ?? fetch, delivery.url, {
      method: "POST", body, signal: controller.signal,
      headers: { "Content-Type": "application/json", "LLD-Signature": signature(delivery.secret, body, Math.floor(now.getTime() / 1000)) },
    }, { resolve: options.resolve });
    response_code = response.status;
  } catch { /* A refused URL and a network failure both count as a failed attempt. */ }
  finally { clearTimeout(timer); }
  const retrySeconds = BACKOFF_SECONDS[delivery.attempt - 1];
  const status = response_code !== null && response_code >= 200 && response_code < 300 ? "delivered" : retrySeconds ? "retry" : "failed";
  const result: DeliveryResult = { status, response_code, attempt: delivery.attempt, next_at: status === "retry" ? new Date(now.getTime() + retrySeconds * 1000).toISOString() : null };
  await store.record(delivery.id, result);
  return result;
}
