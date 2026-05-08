// Arthur semantic memory retrieval — local mirror of @arthur/core canonical:
//   ~/arthur-core/src/memory.ts
//
// Next.js cannot import packages outside the project root, so this file
// is the dashboard copy. When you update the canonical, update this file too.
//
// Dashboard uses embeddingsSource:'supabase' (arthur_corpus_embeddings table).
// CLI uses embeddingsSource:'file' (local jsonl + Ollama).

const SIMILARITY_THRESHOLD = 0.55;

export interface MemoryHit {
  input: string;
  output_preview: string;
  timestamp: string;
  score: number;
}

export type EmbeddingsSource = "file" | "supabase";

export interface RetrieveOptions {
  embeddingsSource?: EmbeddingsSource;
  supabaseUrl?: string;
  supabaseKey?: string;
  embedUrl?: string;
  embedModel?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Math
// ─────────────────────────────────────────────────────────────────────────────

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─────────────────────────────────────────────────────────────────────────────
// Embedding
// ─────────────────────────────────────────────────────────────────────────────

async function embedQuery(text: string, opts: RetrieveOptions): Promise<number[] | null> {
  const url   = opts.embedUrl   ?? "http://localhost:11434/api/embeddings";
  const model = opts.embedModel ?? "nomic-embed-text:latest";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text.slice(0, 2000) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { embedding?: number[] };
    return Array.isArray(data.embedding) ? data.embedding : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase backend — vector similarity via pgvector RPC then brute-force fallback
// ─────────────────────────────────────────────────────────────────────────────

async function retrieveFromSupabase(
  queryVec: number[],
  k: number,
  opts: RetrieveOptions
): Promise<MemoryHit[]> {
  const url = opts.supabaseUrl ?? "";
  const key = opts.supabaseKey ?? "";
  if (!url || !key) return [];

  try {
    // Try pgvector RPC first (fast)
    const rpcRes = await fetch(`${url}/rest/v1/rpc/match_corpus_embeddings`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "apikey":        key,
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        query_embedding: queryVec,
        match_threshold: SIMILARITY_THRESHOLD,
        match_count: k,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (rpcRes.ok) {
      const rows = await rpcRes.json() as Array<{
        input: string; output_preview: string | null; ts: string | null; similarity: number;
      }>;
      if (Array.isArray(rows) && rows.length > 0) {
        return rows.map(r => ({
          input:          r.input,
          output_preview: r.output_preview ?? "",
          timestamp:      r.ts ?? "",
          score:          Math.round((r.similarity ?? 0) * 1000) / 1000,
        }));
      }
    }

    // RPC unavailable or empty — brute-force over all rows
    const tableRes = await fetch(
      `${url}/rest/v1/arthur_corpus_embeddings?select=input,output_preview,ts,embedding&limit=2000`,
      {
        headers: {
          "apikey":        key,
          "Authorization": `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!tableRes.ok) return [];

    const rows = await tableRes.json() as Array<{
      input: string; output_preview: string | null; ts: string | null; embedding: number[] | string;
    }>;
    if (!Array.isArray(rows)) return [];

    const scored = rows
      .map(r => {
        const emb = typeof r.embedding === "string"
          ? JSON.parse(r.embedding) as number[]
          : r.embedding;
        return { r, score: cosine(queryVec, emb) };
      })
      .filter(x => x.score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return scored.map(x => ({
      input:          x.r.input,
      output_preview: x.r.output_preview ?? "",
      timestamp:      x.r.ts ?? "",
      score:          Math.round(x.score * 1000) / 1000,
    }));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve the top-k semantically similar past turns from the training corpus.
 * Dashboard callers: pass embeddingsSource:'supabase' + supabaseUrl + supabaseKey.
 * Fails silently — returns [] on any error.
 */
export async function retrieveSimilar(
  query: string,
  k = 3,
  opts: RetrieveOptions = {}
): Promise<MemoryHit[]> {
  const source = opts.embeddingsSource ?? "supabase";
  try {
    const queryVec = await embedQuery(query, opts);
    if (!queryVec) return [];

    if (source === "supabase") {
      return retrieveFromSupabase(queryVec, k, opts);
    }

    // file backend not available in dashboard (no local FS access on Fly)
    return [];
  } catch {
    return [];
  }
}
