import { describe, it, expect } from "vitest";
import { buildComplianceOverlays } from "@/lib/compliance-overlays";

describe("buildComplianceOverlays", () => {
  it("all off by default → empty array", () => {
    expect(buildComplianceOverlays({}, 10)).toEqual([]);
  });

  it("ctaText → highlight CTA in the last 2.5s", () => {
    const out = buildComplianceOverlays({ ctaText: "👇 tap the cart below" }, 10);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: "👇 tap the cart below", style: "highlight", startTime: 7.5, endTime: 10 });
  });

  it("short-video CTA tail duration is never negative (clamped to the total duration)", () => {
    const out = buildComplianceOverlays({ ctaText: "get it" }, 1.5);
    expect(out[0].startTime).toBe(0);
    expect(out[0].endTime).toBe(1.5);
  });

  it("empty / blank ctaText → no CTA", () => {
    expect(buildComplianceOverlays({ ctaText: "   " }, 10)).toEqual([]);
  });

  it("aigcBadge → opening badge with the default copy, shown for 4s (≥2s platform compliance minimum)", () => {
    const out = buildComplianceOverlays({ aigcBadge: true }, 30);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: "AI-generated", style: "badge", startTime: 0, endTime: 4 });
  });

  it("very short videos: the badge is clamped to the total duration (never longer than the video)", () => {
    const out = buildComplianceOverlays({ aigcBadge: true }, 1.2);
    expect(out[0].startTime).toBe(0);
    expect(out[0].endTime).toBe(1.2);
  });

  it("aigcBadgeText overrides the default copy; blank falls back to the default", () => {
    expect(buildComplianceOverlays({ aigcBadge: true, aigcBadgeText: "AI composite content" }, 30)[0].text).toBe("AI composite content");
    expect(buildComplianceOverlays({ aigcBadge: true, aigcBadgeText: "  " }, 30)[0].text).toBe("AI-generated");
  });

  it("badge + CTA together: badge at the start, highlight at the end, no overlap", () => {
    const out = buildComplianceOverlays({ aigcBadge: true, ctaText: "get it" }, 30);
    expect(out).toHaveLength(2);
    const badge = out.find((o) => o.style === "badge")!;
    const cta = out.find((o) => o.style === "highlight")!;
    expect(badge.endTime).toBeLessThanOrEqual(cta.startTime);
  });
});
