import { beforeAll, describe, expect, it } from "vitest";
import { createReplyToken, verifyReplyToken } from "@/lib/requests/replyLink";

// One-tap reply links (SEC-067): only genuine, unexpired links name a conversation.
beforeAll(() => {
  process.env.AUTH_SECRET ||= "test-secret-for-reply-links-0123456789";
});

const MATCH = "cmatch0000000000001";
const USER = "cuser00000000000001";

describe("reply links", () => {
  it("round-trips the match and member", () => {
    expect(verifyReplyToken(createReplyToken(MATCH, USER))).toEqual({ matchId: MATCH, userId: USER });
  });

  it("rejects a changed match, member or signature", () => {
    const t = createReplyToken(MATCH, USER);
    const [m, u, e, s] = t.split(".");
    expect(verifyReplyToken([`${m}x`, u, e, s].join("."))).toBeNull();
    expect(verifyReplyToken([m, "cother0000000000001", e, s].join("."))).toBeNull();
    // Always a different last character (replacing with a fixed "A" was a no-op 1 time in 64).
    expect(verifyReplyToken([m, u, e, `${s!.slice(0, -1)}${s!.endsWith("A") ? "B" : "A"}`].join("."))).toBeNull();
    expect(verifyReplyToken("not-a-token")).toBeNull();
    expect(verifyReplyToken("a.b.c.d")).toBeNull();
  });

  it("expires after seven days", () => {
    const issued = new Date("2026-10-01T00:00:00Z");
    const t = createReplyToken(MATCH, USER, issued);
    expect(verifyReplyToken(t, new Date("2026-10-07T23:00:00Z"))).not.toBeNull();
    expect(verifyReplyToken(t, new Date("2026-10-08T01:00:00Z"))).toBeNull();
  });
});
