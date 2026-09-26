// Multipart bodies read with a hard byte cap (Phase 13, SEC-015). The Content-Length check in each
// upload route only helps when the header is sent; a chunked request has none, and req.formData()
// would buffer whatever arrives. This reads the stream itself and stops at the cap.

export type LimitedForm = { ok: true; form: FormData } | { ok: false; error: "tooLarge" | "invalid" };

/** Room for multipart boundaries and the small text fields sent alongside the file. */
export const MULTIPART_OVERHEAD = 64 * 1024;

export async function readLimitedFormData(req: Request, maxFileBytes: number): Promise<LimitedForm> {
  const limit = maxFileBytes + MULTIPART_OVERHEAD;
  if (Number(req.headers.get("content-length") ?? 0) > limit) return { ok: false, error: "tooLarge" };
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data") || !req.body) return { ok: false, error: "invalid" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, error: "tooLarge" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: "invalid" };
  }
  try {
    const form = await new Response(Buffer.concat(chunks), { headers: { "content-type": type } }).formData();
    return { ok: true, form };
  } catch {
    return { ok: false, error: "invalid" };
  }
}
