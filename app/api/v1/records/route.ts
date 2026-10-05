import { loveleedayAnon } from "@/lib/client-portal/anon";
import { connectorsServerSecret } from "@/lib/client-portal/connector-api";
import { handlePublicApi } from "@/lib/client-portal/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const db = loveleedayAnon();
  return handlePublicApi(req, "records", async (name, args) => await db.rpc(name, args), connectorsServerSecret());
}
