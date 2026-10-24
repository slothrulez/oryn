import { describe, it, expect } from "vitest";
import { buildEndCardFilter } from "@/lib/video-composer/end-card";

describe("buildEndCardFilter (end-card scan-to-buy QR overlay)", () => {
  it("no CTA: scaled QR + centered overlay in the tail time window, output [vout]", () => {
    const vf = buildEndCardFilter({ width: 1080, totalDuration: 20 });
    expect(vf).toContain("[1:v]scale=");
    expect(vf).toContain("[0:v][qr]overlay=");
    expect(vf).toContain("(main_w-overlay_w)/2");
    expect(vf).toContain("enable='gte(t,17.00)'");
    expect(vf.trim().endsWith("[vout]")).toBe(true);
    expect(vf).not.toContain("drawtext=");
  });

  it("with CTA: appends centered boxed text chained to [vout], with escaping applied", () => {
    const vf = buildEndCardFilter({ width: 1080, totalDuration: 25, ctaText: "scan to buy ↓" });
    expect(vf).toContain("overlay=");
    expect(vf).toContain("[ov];[ov]");
    expect(vf).toContain("drawtext=");
    expect(vf).toContain("expansion=none");
    expect(vf).toContain("x=(w-text_w)/2");
    expect(vf.trim().endsWith("[vout]")).toBe(true);
    expect((vf.match(/enable='gte\(t,22\.00\)'/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("tail duration is clamped to the video length (short videos stay in bounds)", () => {
    const vf = buildEndCardFilter({ width: 720, totalDuration: 2, seconds: 3 });
    expect(vf).toContain("enable='gte(t,0.00)'"); // show=min(3,2)=2 → start=0
  });

  it("missing duration (0) produces no negative start", () => {
    const vf = buildEndCardFilter({ width: 1080, totalDuration: 0 });
    expect(vf).toContain("enable='gte(t,0.00)'");
  });
});
