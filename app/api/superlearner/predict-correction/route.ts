import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

// ── nomic-embed via local Ollama ─────────────────────────────────────────────
async function getEmbedding(text: string): Promise<number[]> {
  try {
    const r = await fetch("http://localhost:11434/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nomic-embed-text", prompt: text.slice(0, 2048) }),
      // @ts-ignore — Next.js server fetch
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`ollama ${r.status}`);
    const j = await r.json() as { embedding: number[] };
    return j.embedding || new Array(512).fill(0);
  } catch {
    // Cloud fallback: Supabase AI (pgvector) or return zero vector
    return new Array(512).fill(0);
  }
}

// ── Feature engineering (matches superlearner-train-reward-model.js) ─────────
function senderDomainHash(from: string): number {
  const domain = (from?.split("@")[1] || "").toLowerCase();
  let hash = 5381;
  for (const c of domain) hash = ((hash << 5) + hash) + c.charCodeAt(0);
  return Math.abs(hash) % 16;
}

function ageBucket(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  if (ageMs < 86400000)       return 0;
  if (ageMs < 7 * 86400000)   return 1;
  if (ageMs < 30 * 86400000)  return 2;
  return 3;
}

function lengthBucket(text: string): number {
  const n = (text || "").length;
  if (n < 200) return 0;
  if (n < 800) return 1;
  return 2;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, x))));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
}

interface RewardModel {
  params: { weights: number[]; bias: number };
  validation_accuracy: number;
  version: string;
  trained_on_n_examples: number;
}

interface PredictBody {
  domain: string;
  input: {
    from?: string;
    subject?: string;
    body_excerpt?: string;
    confidence?: number;
    created_at?: string;
  };
}

export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  let body: PredictBody;
  try {
    body = await req.json() as PredictBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { domain, input } = body;
  if (!domain || !input) {
    return NextResponse.json({ error: "domain and input required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // Load active reward model for this domain
  const { data: model, error: modelErr } = await db
    .from("arthur_reward_model")
    .select("params, validation_accuracy, version, trained_on_n_examples")
    .eq("domain", domain)
    .eq("is_active", true)
    .maybeSingle();

  if (modelErr || !model) {
    // No trained model yet — return a conservative default
    return NextResponse.json({
      correction_probability: 0.2,
      model_version: null,
      model_available: false,
      note: "No active model for this domain yet. Default 0.2 correction probability.",
    });
  }

  const rm = model as RewardModel;

  // Build features
  const text = [input.from, input.subject, input.body_excerpt].filter(Boolean).join(" ");
  const fullEmb = await getEmbedding(text);
  // Reduce to 64 dims (every 8th)
  const embReduced = fullEmb.filter((_, i) => i % 8 === 0);

  const features = [
    ...embReduced,
    senderDomainHash(input.from || "") / 15,
    ageBucket(input.created_at || new Date().toISOString()) / 3,
    lengthBucket(input.body_excerpt || "") / 2,
    input.confidence ?? 0.5,
  ];

  const { weights, bias } = rm.params;
  const score = sigmoid(dot(features, weights) + bias);

  return NextResponse.json({
    correction_probability: Math.round(score * 1000) / 1000,
    model_version: rm.version,
    model_available: true,
    validation_accuracy: rm.validation_accuracy,
    trained_on_n_examples: rm.trained_on_n_examples,
    threshold: 0.4,
    should_escalate: score > 0.4,
  });
}
