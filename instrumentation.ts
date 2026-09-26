// Runs once per server start (Next.js instrumentation hook). Phase 17: background jobs in-process.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { startInProcessJobs } = await import("@/lib/jobs/inProcess");
    startInProcessJobs();
  }
}
