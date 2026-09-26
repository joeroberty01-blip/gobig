// Phase 16: background worker — `npm run worker` (a Render "Background Worker", or any machine
// with the app's env). Several can run at once; jobs are claimed without overlap.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { tick } from "@/lib/jobs/handlers";
import { log } from "@/lib/log";
import { prisma } from "@/lib/db";

const workerId = `worker-${randomUUID().slice(0, 8)}`;
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));

(async () => {
  log.info("worker started", { workerId });
  while (!stopping) {
    try {
      const r = await tick({ workerId, limit: 50 });
      // Busy: go again at once. Idle: poll every 2 s.
      if (r.done + r.failed + r.dead === 0) await new Promise((res) => setTimeout(res, 2_000));
    } catch (err) {
      log.error("worker tick failed", { workerId, error: err instanceof Error ? err.message : String(err) });
      await new Promise((res) => setTimeout(res, 5_000));
    }
  }
  log.info("worker stopped", { workerId });
  await prisma.$disconnect();
})();
