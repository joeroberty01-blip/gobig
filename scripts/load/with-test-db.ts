// Phase 19: runs a command against the TEST database and TEST object storage, so load tests never
// touch the live site's data. The in-process job loop is off, so it never claims test jobs.
//   npx tsx scripts/load/with-test-db.ts <command> [args…]
import "dotenv/config";
import { spawn } from "node:child_process";

const db = process.env.DATABASE_URL_TEST;
const storage = process.env.S3_ENDPOINT_TEST;
if (!db || db === process.env.DATABASE_URL) throw new Error("DATABASE_URL_TEST must be set and differ from DATABASE_URL.");
if (!storage || storage === process.env.S3_ENDPOINT) throw new Error("S3_ENDPOINT_TEST must be set and differ from S3_ENDPOINT.");

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) throw new Error("usage: with-test-db.ts <command> [args…]");

const child = spawn(cmd, args, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: db, DIRECT_URL: db, S3_ENDPOINT: storage, DATABASE_URL_READ: "", REDIS_URL: "", JOBS_IN_WEB: "false" },
});
child.on("exit", (code) => process.exit(code ?? 1));
