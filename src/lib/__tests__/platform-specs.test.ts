import { describe, it, expect } from "vitest";
import { PLATFORM_SPECS, getPlatformSpec, getOffSiteQrPolicy } from "@/lib/platform-specs";

describe("platform-specs (multi-platform export specs)", () => {
  it("covers the global commerce platforms only (TikTok / Reels / Shorts)", () => {
    expect(Object.keys(PLATFORM_SPECS).sort()).toEqual(["reels", "shorts", "tiktok"]);
  });

  it("TikTok Shop = 1080x1920 vertical 9:16", () => {
    expect(getPlatformSpec("tiktok")).toMatchObject({ name: "TikTok Shop", w: 1080, h: 1920, ratio: "9:16" });
  });

  it("Reels / Shorts match TikTok at 9:16 1080×1920 (one vertical cut, exported per platform name)", () => {
    expect(getPlatformSpec("reels")).toMatchObject({ name: "Instagram Reels", w: 1080, h: 1920, ratio: "9:16" });
    expect(getPlatformSpec("shorts")).toMatchObject({ name: "YouTube Shorts", w: 1080, h: 1920, ratio: "9:16" });
  });

  it("every spec has positive dimensions and a non-empty ratio", () => {
    for (const spec of Object.values(PLATFORM_SPECS)) {
      expect(spec.w).toBeGreaterThan(0);
      expect(spec.h).toBeGreaterThan(0);
      expect(spec.ratio.length).toBeGreaterThan(0);
    }
  });

  it("unknown platform returns undefined", () => {
    expect(getPlatformSpec("myspace")).toBeUndefined();
    expect(getPlatformSpec("friendster")).toBeUndefined();
  });
});

describe("getOffSiteQrPolicy (in-video QR off-site traffic policy)", () => {
  it("global platforms (tiktok/reels/shorts) = ok", () => {
    for (const plat of ["tiktok", "reels", "shorts"]) {
      expect(getOffSiteQrPolicy(plat).level).toBe("ok");
    }
  });

  it("unset platform = ok with an English reason", () => {
    const p = getOffSiteQrPolicy(undefined);
    expect(p.level).toBe("ok");
    expect(p.reason.en.length).toBeGreaterThan(0);
  });
});
