import { describe, it, expect } from "vitest";
import { frameHolds, frameMotionFilter, FRAME_DISSOLVE_SEC } from "@/lib/video-composer/frame-sequence";
import { buildProductScenePrompt, buildCameraFramePrompt } from "@/lib/product-scene-prompt";

describe("frame sequence", () => {
  it("holds overlap by the dissolve so the sequence lasts the shot duration", () => {
    const holds = frameHolds(3, 4);
    const total = holds.reduce((a, b) => a + b, 0) - FRAME_DISSOLVE_SEC * 2;
    expect(total).toBeCloseTo(4, 5);
  });

  it("cycles eased push-in, drift and settle moves", () => {
    expect(frameMotionFilter(0, 90, 1080, 1920)).toMatch(/zoompan=z='1\+0\.16\*\(1-pow/);
    expect(frameMotionFilter(1, 90, 1080, 1920)).toContain("x='iw/2-(iw/zoom/2)+(iw/zoom)*0.08");
    expect(frameMotionFilter(2, 90, 1080, 1920)).toMatch(/z='1\.18-0\.14/);
    expect(frameMotionFilter(0, 90, 1080, 1920)).toContain("s=1080x1920");
  });
});

describe("director notes", () => {
  it("adds lens/light notes and continuity, keeps CTA close to the photo", () => {
    const p = buildProductScenePrompt("Cup on a desk", true, "demo", { previous: "Woman rinsing the cup", notes: true });
    expect(buildProductScenePrompt("Cup on a desk", true, "demo")).not.toContain("Director:");
    expect(p).toContain("Director: 50mm");
    expect(p).toContain('Continuity: this follows a shot of "Woman rinsing the cup"');
    expect(buildProductScenePrompt("Offer shot", true, "cta")).not.toContain("different camera angle");
    expect(buildCameraFramePrompt(0)).toMatch(/same scene/i);
  });
});
