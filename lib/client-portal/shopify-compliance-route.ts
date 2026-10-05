import { NextRequest, NextResponse } from "next/server";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { connectorsServerSecret } from "@/lib/client-portal/connector-api";
import { handleShopifyCompliance, type ShopifyTopic } from "@/lib/connectors/privacy/shopify-compliance";

// Shared body of the three Shopify mandatory compliance routes. The raw body is read once as text because the HMAC is
// computed over the exact bytes Shopify sent. Public in middleware (the signature is the credential).
export function shopifyComplianceRoute(topic: ShopifyTopic) {
  return async function POST(req: NextRequest) {
    const rawBody = await req.text();
    const anon = loveleedayAnon();
    const r = await handleShopifyCompliance({
      topic,
      rawBody,
      hmacHeader: req.headers.get("x-shopify-hmac-sha256"),
      secret: process.env.CONNECTOR_OAUTH_SHOPIFY_CLIENT_SECRET,
      serverSecret: connectorsServerSecret(),
      rpc: async (fn, args) => {
        const out = await anon.rpc(fn, args);
        return { data: out.data, error: out.error ? { message: out.error.message } : null };
      },
    });
    return NextResponse.json(r.body, { status: r.status });
  };
}
