// Anonymous analytics visitor id (Phase 6). Set by proxy.ts on discovery pages; only its salted
// daily hash is ever stored (lib/services/connectEvents.ts).
export const VISITOR_COOKIE = "gobig_vid";
export const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
