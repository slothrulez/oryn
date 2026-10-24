import { describe, it, expect } from "vitest";
import { easeExpr, interpolate } from "@/lib/video-composer/easing";
import { MOTIONS } from "@/lib/video-composer/motions";

describe("easeExpr", () => {
  it("linear as-is; easeOut/easeIn follow their formulas", () => {
    expect(easeExpr("p", "linear")).toBe("(p)");
    expect(easeExpr("p", "easeOut")).toContain("1-pow(1-p,2)");
    expect(easeExpr("p", "easeIn")).toContain("pow(p,2)");
  });
});

describe("interpolate", () => {
  it("includes progress, start/end values and easing", () => {
    const z = interpolate("on", 90, 1, 1.5, "easeOut");
    expect(z).toContain("on/90");
    expect(z).toContain("1+(0.5)"); // v0 + (v1-v0)
    expect(z).toContain("1-pow"); // easeOut
  });
  it("frames<1 guards against division by zero", () => {
    expect(interpolate("on", 0, 1, 2, "linear")).toContain("on/1");
  });
  it("defaults to linear", () => {
    expect(interpolate("on", 10, 0, 1)).toContain("(on/10)");
  });
});

describe("MOTIONS use easing (not constant speed)", () => {
  it("zoom_in_slow / ken_burns use easeOut instead of hard-coded constant increments", () => {
    const zin = MOTIONS.zoom_in_slow.getFilter(1080, 1920, 3);
    expect(zin).toContain("1-pow"); // eased
    expect(zin).not.toContain("min(zoom+0.002"); // old constant-speed increment replaced
    expect(zin).toContain("zoompan");
    expect(MOTIONS.ken_burns.getFilter(1080, 1920, 3)).toContain("1-pow");
  });
});
