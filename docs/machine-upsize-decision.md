# arthur-online machine upsize — expected gain vs monthly cost

Written 2026-08-09 at Daniel's request, to be decided against real numbers later.
**Recommendation: do not upsize.** The measured bottleneck is not CPU.

## Current

One machine, `shared-cpu-1x`, 2GB, region `ord`.
`auto_stop_machines = false`, `min_machines_running = 1` — it never scales to zero,
so **cold start is already ruled out** as a latency source.

## What the measurements actually say

After moving the SSE stream open ahead of the Supabase work (v996), server-side
phase timing across 12 consecutive real requests:

| phase | cost | nature |
|---|---|---|
| `rateLimit` → `streamOpen` | **76–492ms** (median ~150ms) | Supabase network round trip |
| `history` | 320–799ms | Supabase queries — now runs *inside* the stream |
| `location` / `memory` / `persona` | tens of ms each | mixed, inside the stream |

Every remaining item is **network I/O — Supabase round trips and outbound LLM
calls — not CPU work.** A faster vCPU does not make a Supabase query or an
Anthropic/DeepSeek call return sooner. That is why an upsize is expected to buy
approximately nothing on time-to-first-byte.

The earlier multi-second swings that looked like CPU contention were largely
self-inflicted: firing benchmark requests back-to-back at a single shared vCPU
creates contention one real user never generates. Spaced at realistic pacing the
server-side numbers are consistently fast.

## Cost of each option

Fly published pricing (Amsterdam reference; `ord` is in the same band — confirm
for the exact region before purchase):

| option | monthly | delta vs today | expected latency gain |
|---|---|---|---|
| `shared-cpu-1x` 2GB (today) | $11.11 | — | — |
| `shared-cpu-2x` 2GB | $11.83 | **+$0.72** | ~none for one user; real headroom for concurrency |
| `shared-cpu-4x` 4GB | $23.66 | +$12.55 | ~none for one user |
| `performance-1x` 2GB | $32.19 | +$21.08 | ~none for one user |

## Where an upsize *would* actually help

- **Concurrency** — several people (or several agent surfaces) hitting chat at once.
  Today that contends on one shared vCPU.
- **Any genuinely CPU-bound path** — e.g. the brute-force fallback in `lib/memory.ts`
  that pulls 2000 embedding rows and scores them in-process, if it ever fires.

Neither describes current single-user usage.

## If you want headroom anyway

`shared-cpu-2x` at **+$0.72/month** is the only option whose cost is small enough
not to need a latency justification. It doubles burst headroom for the price of a
coffee per year. `performance-1x` at +$21.08/month is not supported by the data —
that is a comfort buy, exactly as Daniel called it.

## Re-open this if

- more than one person or surface uses the dashboard concurrently, or
- phase timing starts showing time in CPU-bound work rather than Supabase/LLM I/O.
