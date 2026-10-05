// In-process scheduler for the connector cron endpoints. The app runs as a single always-on machine
// (fly.toml: min_machines_running = 1, auto_stop off, one volume), so a timer here is the schedule.
// It calls the app's own routes over loopback with the connectors secret; overlapping runs are skipped.
export type Job = { path: string; everyMs: number };

export const JOBS: Job[] = [
  { path: "/api/cron/sync", everyMs: 60 * 60 * 1000 },
  { path: "/api/cron/webhooks", everyMs: 5 * 60 * 1000 },
];

export function startScheduler(env: Record<string, string | undefined> = process.env, doFetch: typeof fetch = fetch): (() => void) | null {
  const secret = env.LOVELEEDAY_CONNECTORS_SERVER_SECRET;
  if (!secret || env.DISABLE_CONNECTOR_SCHEDULER === "1") return null;
  const base = `http://127.0.0.1:${env.PORT || "3000"}`;
  const running = new Set<string>();
  const run = async (job: Job) => {
    if (running.has(job.path)) return;
    running.add(job.path);
    try {
      const res = await doFetch(base + job.path, { method: "POST", headers: { "x-connectors-secret": secret }, signal: AbortSignal.timeout(300_000) });
      console.log(`[connector-scheduler] ${job.path} ${res.status}`);
    } catch (e) {
      console.log(`[connector-scheduler] ${job.path} failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      running.delete(job.path);
    }
  };
  const timers = JOBS.map((j) => {
    const t = setInterval(() => void run(j), j.everyMs);
    t.unref?.();
    return t;
  });
  return () => timers.forEach(clearInterval);
}
