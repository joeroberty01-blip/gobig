import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { ADMIN_ONLY_SECTIONS, ADMIN_ONLY_SUBSECTIONS, publicDictionary } from "@/lib/i18n/clientDictionary";

// SEC-041 guard: client components outside the admin area only get the trimmed dictionary.
const ADMIN_ONLY_FILES = [
  /^components[\/]admin[\/](?!platform[\/]ReportButton)/,
  /^components[\/]trust[\/]AdminTrustForms/,
  /^components[\/]monetization[\/]AdminBillingForms/,
  /^app[\/]admin[\/]/,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("public client dictionary", () => {
  it("drops the admin-only sections but keeps what the report button needs", () => {
    const full = getDictionary("en");
    const pub = publicDictionary(full);
    for (const k of ADMIN_ONLY_SECTIONS) expect(pub[k]).toEqual({});
    for (const path of ADMIN_ONLY_SUBSECTIONS) {
      const [section, sub] = path.split(".") as [keyof typeof pub, string];
      expect((pub[section] as Record<string, unknown>)[sub]).toEqual({});
    }
    expect(pub.adminPlatform.report).toEqual(full.adminPlatform.report);
    expect(JSON.stringify(pub).length).toBeLessThan(JSON.stringify(full).length * 0.8);
  });

  it("no client component outside the admin area uses a removed section", () => {
    const offenders: string[] = [];
    for (const f of [...files("components"), ...files("app"), ...files("lib")]) {
      // Same result on Windows ("components\trust\...") and Linux paths.
      if (ADMIN_ONLY_FILES.some((r) => r.test(f.split("\\").join("/")))) continue;
      const src = readFileSync(f, "utf8");
      if (!src.startsWith('"use client"')) continue;
      const removed = new RegExp(`\bt\.(${ADMIN_ONLY_SECTIONS.join("|")})\.|\bt\.adminPlatform\.(?!reports?\b)`);
      if (removed.test(src)) offenders.push(f);
      // Phase 17: nor the admin-only parts of public sections.
      if (ADMIN_ONLY_SUBSECTIONS.some((p) => src.includes(`t.${p}`))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
