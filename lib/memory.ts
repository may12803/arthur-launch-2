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

/** Thrown when the embedder itself is unusable — distinct from "no hits". */
export class MemoryEmbedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryEmbedError";
  }
}

// FAIL LOUD. This used to default to http://localhost:11434 and return null on
// any failure, which retrieveSimilar turned into an empty result set. On Fly that
// host does not resolve, so dashboard recall returned zero hits on every single
// turn and nothing ever errored — indistinguishable from "the corpus had no
// match". A clean zero from a filter is a suspect, not a result.
//
// There is now no localhost default and no null return: an unset or unreachable
// embedder throws, so a broken embedder can never masquerade as an empty corpus.
async function embedQuery(text: string, opts: RetrieveOptions): Promise<number[]> {
  const url = opts.embedUrl;
  if (!url) {
    throw new MemoryEmbedError(
      "embedUrl is not set (OLLAMA_EMBED_URL missing). Refusing to silently return zero hits."
    );
  }
  const model = opts.embedModel ?? "nomic-embed-text:latest";
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text.slice(0, 2000) }),
      // Modal scales to zero; a cold start pulls the model. Generous timeout so a
      // cold embedder is slow, not "empty".
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    throw new MemoryEmbedError(`embedder unreachable at ${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    throw new MemoryEmbedError(`embedder ${url} returned HTTP ${res.status}`);
  }
  const data = await res.json() as { embedding?: number[] };
  if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
    throw new MemoryEmbedError(`embedder ${url} returned no embedding`);
  }
  return data.embedding;
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
  // NOTE: no blanket try/catch here any more. A MemoryEmbedError means the
  // embedder is broken and must surface to the caller; swallowing it here is
  // exactly how recall stayed silently dead. Genuine "no similar rows" still
  // returns [] from retrieveFromSupabase.
  const queryVec = await embedQuery(query, opts);

  if (source === "supabase") {
    return retrieveFromSupabase(queryVec, k, opts);
  }

  // file backend not available in dashboard (no local FS access on Fly)
  return [];
}
