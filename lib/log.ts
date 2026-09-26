// Phase 16: one structured log line per event (JSON in production, readable in development), so a
// log service can search by requestId/jobId. Values under sensitive-looking keys are replaced
// before anything is written: passwords, tokens, secrets, keys, cookies, phones, emails, exact
// coordinates. Never pass raw request bodies here.

type Fields = Record<string, unknown>;
type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|session|otp|totp|phone|email|lat(itude)?$|lng|lon(gitude)?$|address|recipient|^(pin|code)$/i;
const MAX_DEPTH = 4;
const MAX_STRING = 1000;

export function redact(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  if (depth >= MAX_DEPTH) return "[depth]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
    return out;
  }
  return String(value);
}

function write(level: Level, msg: string, fields: Fields = {}) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const entry = { level, msg, time: new Date().toISOString(), ...(redact(fields) as Fields) };
  const line = process.env.NODE_ENV === "production" ? JSON.stringify(entry) : `[${level}] ${msg} ${Object.keys(fields).length ? JSON.stringify(entry) : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Fields) => write("debug", msg, fields),
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
