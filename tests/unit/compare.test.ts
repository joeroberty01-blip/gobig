import { describe, expect, it } from "vitest";
import { compareHref, MAX_COMPARE, parseCompareSlugs } from "@/lib/compare";

describe("compare links", () => {
  it("keeps up to three distinct, well-formed slugs in order", () => {
    expect(parseCompareSlugs("b,a,b, C ,d")).toEqual(["b", "a", "c"]);
    expect(parseCompareSlugs(["x", "y"])).toEqual(["x", "y"]);
    expect(parseCompareSlugs("../etc,<script>,ok-1")).toEqual(["ok-1"]);
    expect(parseCompareSlugs(undefined)).toEqual([]);
    expect(parseCompareSlugs("a".repeat(81))).toEqual([]);
  });
  it("builds the shareable URL", () => {
    expect(compareHref(["a", "b", "c", "d"])).toBe("/compare?p=a,b,c");
    expect(MAX_COMPARE).toBe(3);
  });
});
