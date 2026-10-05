import { shopifyComplianceRoute } from "@/lib/client-portal/shopify-compliance-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = shopifyComplianceRoute("customers/data_request");
