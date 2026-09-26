import { describe, expect, it } from "vitest";
import { MULTIPART_OVERHEAD, readLimitedFormData } from "@/lib/upload";

// SEC-015: the byte cap holds even when the client sends no Content-Length (chunked upload).
async function multipart(bytes: number) {
  const fd = new FormData();
  fd.set("kind", "GALLERY");
  fd.set("file", new File([new Uint8Array(bytes)], "a.jpg", { type: "image/jpeg" }));
  const r = new Request("http://x/", { method: "POST", body: fd });
  return { body: new Uint8Array(await r.arrayBuffer()), type: r.headers.get("content-type")! };
}

function chunked(body: Uint8Array, type: string, headers: Record<string, string> = {}) {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (sent >= body.length) return c.close();
      c.enqueue(body.subarray(sent, sent + 16_384));
      sent += 16_384;
    },
  });
  const req = new Request("http://x/", { method: "POST", body: stream, headers: { "content-type": type, ...headers }, duplex: "half" } as RequestInit);
  return { req, read: () => Math.min(sent, body.length) };
}

describe("readLimitedFormData", () => {
  it("parses a body under the cap", async () => {
    const { body, type } = await multipart(1000);
    const r = await readLimitedFormData(chunked(body, type).req, 10_000);
    if (!r.ok) throw new Error(r.error);
    expect(r.form.get("kind")).toBe("GALLERY");
    expect((r.form.get("file") as File).size).toBe(1000);
  });

  it("stops reading an oversized chunked body without a Content-Length", async () => {
    const { body, type } = await multipart(2_000_000);
    const c = chunked(body, type);
    expect(c.req.headers.get("content-length")).toBeNull();
    expect(await readLimitedFormData(c.req, 100_000)).toEqual({ ok: false, error: "tooLarge" });
    expect(c.read()).toBeLessThan(100_000 + MULTIPART_OVERHEAD + 32_768); // gave up early, not after 2 MB
  });

  it("refuses a declared oversized body before reading it", async () => {
    const { body, type } = await multipart(10);
    const c = chunked(body, type, { "content-length": "999999999" });
    expect(await readLimitedFormData(c.req, 100_000)).toEqual({ ok: false, error: "tooLarge" });
    expect(c.read()).toBeLessThanOrEqual(16_384); // at most the one chunk the stream prefetches
  });

  it("rejects non-multipart and malformed bodies", async () => {
    expect(await readLimitedFormData(new Request("http://x/", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }), 1000)).toEqual({ ok: false, error: "invalid" });
    const bad = chunked(new TextEncoder().encode("garbage"), "multipart/form-data; boundary=zzz");
    expect(await readLimitedFormData(bad.req, 1000)).toEqual({ ok: false, error: "invalid" });
  });
});
