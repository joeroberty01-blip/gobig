import { randomUUID } from "node:crypto";
import { tick } from "./handlers";
import { log } from "@/lib/log";

// Phase 17: drains the job queue inside each web server, so trips expire and re-dispatch on hosts
// with no separate worker (Render free plan). Safe with any number of instances: jobs are claimed
// with SKIP LOCKED. Set JOBS_IN_WEB=false once a dedicated `npm run worker` runs.
const g = globalThis as unknown as { nexaJobLoop?: boolean };

export function startInProcessJobs(intervalMs = 5_000) {
  if (g.nexaJobLoop || process.env.JOBS_IN_WEB === "false") return;
  g.nexaJobLoop = true;
  const workerId = `web-${randomUUID().slice(0, 8)}`;
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick({ workerId, limit: 20 });
    } catch (err) {
      log.warn("in-process jobs tick failed", { workerId, error: err instanceof Error ? err.message : String(err) });
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref?.();
}
