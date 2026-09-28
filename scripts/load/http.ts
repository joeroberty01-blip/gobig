// Phase 19: HTTP load test for the public pages.
//   npx tsx scripts/load/http.ts [--base http://localhost:3002] [--connections 50] [--seconds 20]
// Setup: `npx tsx scripts/load/with-test-db.ts npm run db:demo:seed`, then `npm run load:serve`.
// Afterwards remove the samples again (`... with-test-db.ts npm run db:demo:remove`) — some
// integration tests search names the samples share.
// Run it against a production build (`next start`) pointed at the TEST database, never the live
// site. The pages are rate-limited per client address; locally (TRUSTED_PROXY_HOPS=1, no proxy)
// the tool's varying X-Forwarded-For spreads its requests over many addresses (see SEC-052).
import autocannon from "autocannon";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const BASE = arg("base", "http://localhost:3002");
const CONNECTIONS = Number(arg("connections", "50"));
const SECONDS = Number(arg("seconds", "20"));
const PROFILE = arg("profile", "baridi-cool-ac");

const targets = [
  { name: "health", path: "/api/health" },
  { name: "home", path: "/" },
  { name: "search", path: "/search?q=fundi" },
  { name: "profile", path: `/p/${PROFILE}` },
];

function run(path: string): Promise<autocannon.Result> {
  let n = 0;
  return new Promise((resolve, reject) => {
    const inst = autocannon(
      {
        url: BASE + path,
        connections: CONNECTIONS,
        duration: SECONDS,
        // A different address per request, so the per-address page limiter measures the app and
        // not itself. Only has an effect when the server trusts X-Forwarded-For (see SEC-052).
        setupClient: (client) => client.setHeaders({ "x-forwarded-for": `10.9.${(n >> 8) & 255}.${n++ & 255}`, cookie: "gobig_locale=sw" }),
      },
      (err, res) => (err ? reject(err) : resolve(res)),
    );
    autocannon.track(inst, { renderProgressBar: false, renderResultsTable: false, renderLatencyTable: false });
  });
}

(async () => {
  console.log(`Load test ${BASE} — ${CONNECTIONS} connections × ${SECONDS}s per page\n`);
  console.log("page      req/s    p50 ms   p97.5 ms  p99 ms   max ms   2xx      non-2xx  errors");
  for (const t of targets) {
    const r = await run(t.path);
    const non2xx = r.non2xx;
    console.log(
      [
        t.name.padEnd(9),
        String(Math.round(r.requests.average)).padEnd(8),
        String(r.latency.p50).padEnd(8),
        String(r.latency.p97_5).padEnd(9),
        String(r.latency.p99).padEnd(8),
        String(r.latency.max).padEnd(8),
        String(r["2xx"]).padEnd(8),
        String(non2xx).padEnd(8),
        String(r.errors + r.timeouts),
      ].join(" "),
    );
  }
})();
