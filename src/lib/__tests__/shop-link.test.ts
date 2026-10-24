import { describe, it, expect } from "vitest";
import { buildShopLink } from "@/lib/shop-link";

describe("buildShopLink (UTM tracking link construction)", () => {
  it("appends utm parameters + platform source", () => {
    const link = buildShopLink("https://shop.example.com/p/123", { platform: "tiktok" });
    const u = new URL(link);
    expect(u.searchParams.get("utm_source")).toBe("tiktok");
    expect(u.searchParams.get("utm_medium")).toBe("short_video");
    expect(u.searchParams.get("utm_campaign")).toBe("oryn");
    expect(u.origin + u.pathname).toBe("https://shop.example.com/p/123");
  });

  it("keeps the existing query and does not overwrite unrelated parameters", () => {
    const link = buildShopLink("https://shop.example.com/p?spm=abc&color=red", { platform: "tiktok" });
    const u = new URL(link);
    expect(u.searchParams.get("spm")).toBe("abc");
    expect(u.searchParams.get("color")).toBe("red");
    expect(u.searchParams.get("utm_source")).toBe("tiktok");
  });

  it("with an affiliate code → appends the aff parameter", () => {
    const link = buildShopLink("https://shop.example.com/p", { platform: "reels", affiliateCode: "AF900" });
    expect(new URL(link).searchParams.get("aff")).toBe("AF900");
  });

  it("empty / invalid / non-http(s) → empty string (the caller can skip directly)", () => {
    expect(buildShopLink("")).toBe("");
    expect(buildShopLink(null)).toBe("");
    expect(buildShopLink("not a url")).toBe("");
    expect(buildShopLink("javascript:alert(1)")).toBe("");
    expect(buildShopLink("ftp://x/y")).toBe("");
  });

  it("no platform → no utm_source, but medium/campaign remain", () => {
    const u = new URL(buildShopLink("https://shop.example.com/p"));
    expect(u.searchParams.has("utm_source")).toBe(false);
    expect(u.searchParams.get("utm_medium")).toBe("short_video");
  });
});
