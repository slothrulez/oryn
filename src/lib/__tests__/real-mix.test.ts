import { describe, it, expect } from "vitest";
import { shotReality, computeRealMix, realMixFromRows } from "@/lib/real-mix";
import { gateItemFromRealMix } from "@/lib/release-gate";

describe("shotReality classification", () => {
  it("assigned assets classify by assets.type: ai_generated=ai, everything else=real", () => {
    expect(shotReality({ assetType: "ai_generated", done: true })).toBe("ai");
    expect(shotReality({ assetType: "stock_footage", done: true })).toBe("real");
    expect(shotReality({ assetType: "user_upload", done: true })).toBe("real");
    expect(shotReality({ assetType: "product_image", done: true })).toBe("real");
  });

  it("product-photo shots without a stored row also count as real (the user's product photo is used directly)", () => {
    expect(shotReality({ visualSource: "product_image", done: false })).toBe("real");
  });

  it("no visuals assigned → null", () => {
    expect(shotReality({ visualSource: "ai_generate", done: false })).toBe(null);
  });
});

describe("computeRealMix duration weighting", () => {
  it("6s real + 4s ai → 60%, passes", () => {
    const mix = computeRealMix([
      { duration: 6, reality: "real" },
      { duration: 4, reality: "ai" },
    ]);
    expect(mix.realRatio).toBeCloseTo(0.6);
    expect(mix.tiltEligible).toBe(true);
    expect(mix.message.en).toContain("60%");
    expect(mix.message.en).toContain("favor");
  });

  it("3s real + 7s ai → 30%, fails, with a suggestion noted as non-mandatory", () => {
    const mix = computeRealMix([
      { duration: 3, reality: "real" },
      { duration: 7, reality: "ai" },
    ]);
    expect(mix.tiltEligible).toBe(false);
    expect(mix.message.en).toContain("30%");
    expect(mix.message.en).toContain("optional");
  });

  it("exactly 50% passes (threshold is inclusive)", () => {
    expect(computeRealMix([
      { duration: 5, reality: "real" },
      { duration: 5, reality: "ai" },
    ]).tiltEligible).toBe(true);
  });

  it("unassigned shots count toward unfilledSec, not the ratio, and the message says so", () => {
    const mix = computeRealMix([
      { duration: 6, reality: "real" },
      { duration: 4, reality: null },
    ]);
    expect(mix.realRatio).toBe(1);
    expect(mix.unfilledSec).toBe(4);
    expect(mix.message.en).toMatch(/unfilled|no visual|not filled/i);
  });

  it("everything unassigned → ratio null, prompting to assign assets first", () => {
    const mix = computeRealMix([{ duration: 5, reality: null }]);
    expect(mix.realRatio).toBe(null);
    expect(mix.tiltEligible).toBe(false);
  });
});

describe("realMixFromRows (assets page view rows)", () => {
  it("done stock rows + pending AI rows → only assigned ones count", () => {
    const mix = realMixFromRows([
      { duration: 4, assetType: "stock_footage", status: "done", visualSource: "ai_generate" },
      { duration: 6, visualSource: "ai_generate", status: "pending" },
    ]);
    expect(mix.realRatio).toBe(1);
    expect(mix.unfilledSec).toBe(6);
  });
});

describe("gateItemFromRealMix: informational only, always pass", () => {
  it("null → pass; failing also passes (does not nag pure-AI pipelines or break --strict)", () => {
    expect(gateItemFromRealMix(null).status).toBe("pass");
    const low = computeRealMix([{ duration: 10, reality: "ai" }]);
    const item = gateItemFromRealMix(low);
    expect(item.status).toBe("pass");
    expect(item.id).toBe("realMix");
    expect(item.message.en).toContain("0%");
    expect(item.problems).toEqual([]);
  });
});
