import { describe, it, expect } from "vitest";
import { CAPTION_SAFE_BOTTOM_RATIO, karaokeSafeMarginV } from "@/lib/video-composer/safe-zone";

describe("subtitle safe area", () => {
  it("the bottom safe ratio matches the product card's 0.17 bottom margin", () => {
    expect(CAPTION_SAFE_BOTTOM_RATIO).toBe(0.17);
  });

  it("karaokeSafeMarginV scales with PlayResY (1920→326)", () => {
    expect(karaokeSafeMarginV(1920)).toBe(326); // round(1920*0.17)
    expect(karaokeSafeMarginV(1280)).toBe(218); // round(1280*0.17)
    expect(karaokeSafeMarginV(1080)).toBe(184); // round(1080*0.17)
  });

  it("with the raised MarginV the subtitle baseline sits above the bottom UI dead zone (bottom ≈16.7%)", () => {
    const playResY = 1920;
    const baselineY = playResY - karaokeSafeMarginV(playResY); // distance from top to caption baseline
    const deadZoneTop = playResY * (1 - 0.167); // top edge of the platform's bottom UI dead zone
    expect(baselineY).toBeLessThanOrEqual(deadZoneTop); // baseline must be above the dead zone
  });

  it("higher than the old marginV=240 (inside the dead zone)", () => {
    expect(karaokeSafeMarginV(1920)).toBeGreaterThan(240);
  });
});
