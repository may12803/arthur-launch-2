import { Nav, Footer } from "../_components/Layout";
import CommunicationsList from "./CommunicationsList";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function CommunicationsPage() {
  let initialRows: unknown[] = [];
  let initialTotal = 0;

  try {
    const db = getSupabaseAdmin();
    const { data, count } = await db
      .from("arthur_communications")
      .select("*", { count: "exact" })
      .order("ts", { ascending: false })
      .limit(200);
    initialRows  = data ?? [];
    initialTotal = count ?? 0;
  } catch {
    // Non-fatal — client will fetch on mount
  }

  return (
    <>
      <Nav />
      <CommunicationsList initialRows={initialRows} initialTotal={initialTotal} />
      <Footer />
    </>
  );
}
