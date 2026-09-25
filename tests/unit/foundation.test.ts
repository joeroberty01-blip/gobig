import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { parseIdentifier } from "@/lib/identifier";
import { can, type Actor } from "@/lib/permissions";
import { roleHome, safeCallbackPath, type Role } from "@/lib/roles";
import { createAdminSchema, loginSchema, resetPasswordSchema, signupSchema } from "@/lib/validators/auth";
import { hashToken } from "@/lib/services/auth";
import { getDictionary } from "@/lib/i18n/dictionaries";

describe("normalizePhone", () => {
  it.each([
    ["0712345678", "255712345678"],
    ["0712 345 678", "255712345678"],
    ["712345678", "255712345678"],
    ["+255 712 345 678", "255712345678"],
    ["255612345678", "255612345678"],
    ["+44 20 7946 0958", "442079460958"],
  ])("%s → %s", (raw, expected) => expect(normalizePhone(raw)).toBe(expected));

  it.each(["", "   ", "0812345678", "12345", "07123456789", "abc0712345678", "+255 812 345 678"])("rejects %j", (raw) =>
    expect(normalizePhone(raw)).toBeNull(),
  );

  it("formats for display", () => expect(formatPhone("255712345678")).toBe("+255 712 345 678"));
});

describe("parseIdentifier", () => {
  it("reads email, lower-cased", () => expect(parseIdentifier(" Me@Example.COM ")).toEqual({ kind: "email", value: "me@example.com" }));
  it("reads phone", () => expect(parseIdentifier("0712 345 678")).toEqual({ kind: "phone", value: "255712345678" }));
  it("rejects junk", () => {
    expect(parseIdentifier("not an id")).toBeNull();
    expect(parseIdentifier("a@b")).toBeNull();
  });
});

describe("signupSchema", () => {
  const base = { role: "CUSTOMER", name: "Asha Juma", password: "secret123", confirmPassword: "secret123" };

  it("accepts phone only and normalises it", () => {
    const r = signupSchema.safeParse({ ...base, phone: "0712 345 678", email: "" });
    expect(r.success && r.data).toMatchObject({ phone: "255712345678", email: undefined });
  });

  it("accepts email only, lower-cased", () => {
    const r = signupSchema.safeParse({ ...base, email: "Asha@Example.com" });
    expect(r.success && r.data.email).toBe("asha@example.com");
  });

  it("requires a phone or an email", () => {
    const r = signupSchema.safeParse({ ...base, email: "", phone: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("contactRequired");
  });

  it("never lets someone sign up as admin", () => {
    for (const role of ["ADMIN", "SUPER_ADMIN"]) {
      expect(signupSchema.safeParse({ ...base, role, phone: "0712345678" }).success).toBe(false);
    }
  });

  it("checks password rules", () => {
    expect(signupSchema.safeParse({ ...base, phone: "0712345678", password: "short", confirmPassword: "short" }).error?.issues[0]?.message).toBe("passwordTooShort");
    expect(signupSchema.safeParse({ ...base, phone: "0712345678", confirmPassword: "different1" }).error?.issues[0]?.message).toBe("passwordsDontMatch");
  });

  it("rejects an invalid phone", () => {
    expect(signupSchema.safeParse({ ...base, phone: "0812345678" }).error?.issues[0]?.message).toBe("phoneInvalid");
  });
});

describe("other auth schemas", () => {
  it("login accepts email or phone", () => {
    expect(loginSchema.safeParse({ identifier: "0712345678", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ identifier: "a@b.co", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ identifier: "nope", password: "x" }).success).toBe(false);
  });
  it("reset needs a plausible token and matching passwords", () => {
    const token = "x".repeat(43);
    expect(resetPasswordSchema.safeParse({ token, password: "newpass12", confirmPassword: "newpass12" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: "short", password: "newpass12", confirmPassword: "newpass12" }).success).toBe(false);
  });
  it("admin creation requires an email", () => {
    expect(createAdminSchema.safeParse({ name: "Admin", email: "x", password: "password1", confirmPassword: "password1" }).success).toBe(false);
  });
});

describe("permissions", () => {
  const actor = (role: Role, status: Actor["status"] = "ACTIVE"): Actor => ({ id: "u", role, status });

  it("gates each area to its roles", () => {
    expect(can(actor("PROVIDER"), "provider-area:access")).toBe(true);
    expect(can(actor("CUSTOMER"), "provider-area:access")).toBe(false);
    expect(can(actor("ADMIN"), "provider-area:access")).toBe(false);
    expect(can(actor("ADMIN"), "admin-area:access")).toBe(true);
    expect(can(actor("SUPER_ADMIN"), "admin-area:access")).toBe(true);
    expect(can(actor("PROVIDER"), "admin-area:access")).toBe(false);
    expect(can(actor("CUSTOMER"), "admin-area:access")).toBe(false);
  });

  it("only super admins create admins", () => {
    expect(can(actor("SUPER_ADMIN"), "admins:create")).toBe(true);
    expect(can(actor("ADMIN"), "admins:create")).toBe(false);
  });

  it("denies suspended users and guests everything", () => {
    expect(can(actor("SUPER_ADMIN", "SUSPENDED"), "admin-area:access")).toBe(false);
    expect(can(actor("CUSTOMER", "SUSPENDED"), "account:view")).toBe(false);
    expect(can(null, "account:view")).toBe(false);
  });
});

describe("routing helpers", () => {
  it("sends each role home", () => {
    expect(roleHome("CUSTOMER")).toBe("/");
    expect(roleHome("PROVIDER")).toBe("/provider");
    expect(roleHome("ADMIN")).toBe("/admin");
    expect(roleHome("SUPER_ADMIN")).toBe("/admin");
  });
  it("only allows same-site callback paths", () => {
    expect(safeCallbackPath("/account")).toBe("/account");
    expect(safeCallbackPath("//evil.com")).toBeNull();
    expect(safeCallbackPath("/\\evil.com")).toBeNull();
    expect(safeCallbackPath("https://evil.com")).toBeNull();
    expect(safeCallbackPath(undefined)).toBeNull();
  });
});

describe("misc", () => {
  it("hashes tokens deterministically without storing them", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toContain("abc");
    expect(hashToken("abc")).toHaveLength(64);
  });

  it("has the same keys in Swahili and English", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(getDictionary("sw")).sort()).toEqual(keys(getDictionary("en")).sort());
  });
});
