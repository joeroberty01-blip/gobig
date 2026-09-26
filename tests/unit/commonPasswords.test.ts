import { describe, expect, it } from "vitest";
import { isCommonPassword } from "@/lib/validators/commonPasswords";
import { passwordSchema } from "@/lib/validators/auth";

describe("common-password check (SEC-019)", () => {
  it("refuses listed passwords whatever the case", () => {
    for (const p of ["password", "Password1", "12345678", "QWERTYUIOP", "tanzania123", "Simba123", "nakupenda"]) expect(isCommonPassword(p)).toBe(true);
  });
  it("refuses one repeated character and plain digit runs", () => {
    expect(isCommonPassword("aaaaaaaa")).toBe(true);
    expect(isCommonPassword("34567890")).toBe(true);
    expect(isCommonPassword("98765432")).toBe(true);
  });
  it("accepts ordinary non-trivial passwords", () => {
    for (const p of ["Kariakoo-fundi-7", "mvua ya jioni 42", "t7#Qm2xR", "38271946"]) expect(isCommonPassword(p)).toBe(false);
  });
  it("is part of the password rule, with its own message", () => {
    const r = passwordSchema.safeParse("password123");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("passwordTooCommon");
    expect(passwordSchema.safeParse("Kariakoo-fundi-7").success).toBe(true);
  });
});
