import { describe, it, expect } from "vitest";
import { keyframeStaticWarnings, keyframeInstantLine } from "@/lib/prompt-lint";
import { clampSellingPoints } from "@/lib/script-engine/generator";
import { chainByDefault } from "@/lib/assets-view";

describe("keyframeStaticWarnings (keyframe static lint: temporal words mean multiple instants a still frame cannot show)", () => {
  it("English temporal words hit: then / starts to / gradually", () => {
    expect(keyframeStaticWarnings("she opens the jar, then applies cream")).toContain("then");
    expect(keyframeStaticWarnings("she starts to smile")).toContain("starts to");
    expect(keyframeStaticWarnings("light gradually warms up")).toContain("gradually");
  });

  it("single-instant phrasing does not misfire: frozen/mid-pour/potential-energy phrasing", () => {
    expect(keyframeStaticWarnings("fingertip hovering over the pump, frozen the instant before the press")).toEqual([]);
    expect(keyframeStaticWarnings("hand frozen mid-pour, cream suspended above the jar")).toEqual([]);
    expect(keyframeStaticWarnings("woman holds up the tissues to camera, window light from the left")).toEqual([]);
  });

  it("empty/undefined input returns an empty array", () => {
    expect(keyframeStaticWarnings("")).toEqual([]);
    expect(keyframeStaticWarnings(undefined)).toEqual([]);
  });

  it("keyframeInstantLine is always the English directive", () => {
    expect(keyframeInstantLine("")).toContain("freeze the instant");
    expect(keyframeInstantLine("close-up of a girl")).toContain("freeze the instant");
  });
});

describe("clampSellingPoints (server-side fallback for the three selling-point hard limits)", () => {
  it("more than 3 items are truncated to 3, and overlong items are cut to 40 characters", () => {
    const out = clampSellingPoints(["three-ply thick tissues that never tear", "this product's value for money is really really high in its category", "safe for moms and babies", "extra fourth item"]);
    expect(out).toHaveLength(3);
    expect(out[1]).toBe("this product's value for money is really");
    expect(out[1].length).toBe(40);
  });

  it("filters empty strings and non-strings; non-array input returns an empty array", () => {
    expect(clampSellingPoints(["  ", "real ingredients", 42, null])).toEqual(["real ingredients"]);
    expect(clampSellingPoints("not an array")).toEqual([]);
    expect(clampSellingPoints(undefined)).toEqual([]);
  });
});

describe("chainByDefault (demo shots are their own content, so no tail-frame chaining by default)", () => {
  it("demo does not chain by default; other types do", () => {
    expect(chainByDefault("demo")).toBe(false);
    for (const t of ["hook", "pain_point", "product_reveal", "social_proof", "cta"]) {
      expect(chainByDefault(t)).toBe(true);
    }
  });
  it("unknown/undefined types chain by default (keeps the old behavior)", () => {
    expect(chainByDefault(undefined)).toBe(true);
    expect(chainByDefault("whatever")).toBe(true);
  });
});
