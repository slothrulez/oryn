import { describe, it, expect } from "vitest";
import { buildAiDeclaration, buildPublishPack, buildPublishPrompt, pickTitles } from "@/lib/publish-pack";

const NON_ENGLISH = /[\u3000-\u303f\u4e00-\u9fff\uac00-\ud7af\uff00-\uffef]/;

describe("pickTitles (varied title hooks)", () => {
  it("3 distinct titles, all contain the name, deterministic per product", () => {
    const t = pickTitles("Cloud Soft Tissues", "ultra soft");
    expect(t).toHaveLength(3);
    expect(new Set(t).size).toBe(3);
    t.forEach((x) => expect(x).toContain("Cloud Soft Tissues"));
    expect(pickTitles("Cloud Soft Tissues", "ultra soft")).toEqual(t);
  });
  it("hooks vary across products (a pool, not one fixed template)", () => {
    const names = ["Red", "Green", "Blue", "Yellow", "Purple"];
    const shells = new Set(names.map((n) => pickTitles(n, "")[0].split(n).join("·")));
    expect(shells.size).toBeGreaterThan(1);
  });
  it("drops point-requiring templates when there is no selling point (no dangling separators)", () => {
    pickTitles("Test Item", "").forEach((x) => {
      expect(x.endsWith(":")).toBe(false);
      expect(x).not.toContain(" — ,");
    });
  });
  it("English only, contains the name", () => {
    pickTitles("Glow Serum", "hydrating").forEach((x) => {
      expect(NON_ENGLISH.test(x)).toBe(false);
      expect(x).toContain("Glow Serum");
    });
  });
});

describe("buildPublishPack (key-free publishing copy pack)", () => {
  it("produces 3 titles that all contain the product name", () => {
    const p = buildPublishPack({ productName: "Cloud Soft Tissues", category: "home" });
    expect(p.titles).toHaveLength(3);
    for (const t of p.titles) expect(t).toContain("Cloud Soft Tissues");
  });

  it("hashtags map by category, carry #, are de-duplicated and capped", () => {
    const p = buildPublishPack({ productName: "Glow Serum", category: "beauty" });
    expect(p.hashtags).toContain("#BeautyTok");
    expect(p.hashtags.every((h) => h.startsWith("#"))).toBe(true);
    expect(new Set(p.hashtags).size).toBe(p.hashtags.length);
    expect(p.hashtags.length).toBeLessThanOrEqual(10);
  });

  it("appends platform hashtags (TikTok / Reels / Shorts)", () => {
    expect(buildPublishPack({ productName: "x", category: "food", platform: "tiktok" }).hashtags).toContain("#TikTokShop");
    expect(buildPublishPack({ productName: "Serum", category: "beauty", platform: "reels" }).hashtags).toContain("#InstagramReels");
    expect(buildPublishPack({ productName: "Serum", category: "beauty", platform: "shorts" }).hashtags).toContain("#YouTubeShorts");
  });

  it("unknown categories fall back to generic hashtags", () => {
    const p = buildPublishPack({ productName: "x", category: "no-such-category" });
    expect(p.hashtags).toContain("#TikTokMadeMeBuyIt");
  });

  it("caption contains the product name and the call to action", () => {
    const p = buildPublishPack({ productName: "Magic Mop", category: "home" });
    expect(p.caption).toContain("Magic Mop");
    expect(p.caption.toLowerCase()).toContain("tap the link below");
  });

  it("selling points are carried into titles/caption", () => {
    const p = buildPublishPack({ productName: "Magic Mop", category: "home", sellingPoints: "cleans in one swipe" });
    expect(p.titles.join(" ") + p.caption).toContain("cleans in one swipe");
  });

  it("empty product name falls back to a placeholder without throwing", () => {
    const p = buildPublishPack({});
    expect(p.titles).toHaveLength(3);
    expect(p.titles.join(" ")).toContain("this find");
    expect(p.caption.length).toBeGreaterThan(0);
  });

  it("long name + selling point never truncates the CTA tail", () => {
    const p = buildPublishPack({
      productName: "An Extremely Long Product Name That Goes Well Past Any Reasonable Limit",
      category: "beauty",
      sellingPoints: "a selling point that is also written far too long and keeps going and going and going",
    });
    expect(p.caption).toContain("tap the link below to grab it");
  });

  it("deterministic: same input, same output", () => {
    const a = buildPublishPack({ productName: "Earbuds", category: "digital", platform: "shorts" });
    const b = buildPublishPack({ productName: "Earbuds", category: "digital", platform: "shorts" });
    expect(a).toEqual(b);
  });

  it("titles are length-clipped", () => {
    const p = buildPublishPack({ productName: "An Extremely Long Product Name That Goes Well Past Any Reasonable Limit", category: "other" });
    for (const t of p.titles) expect(Array.from(t).length).toBeLessThanOrEqual(60);
  });

  it("all copy is English", () => {
    const p = buildPublishPack({ productName: "Glow Serum", category: "beauty", platform: "tiktok" });
    const all = p.titles.join(" ") + " " + p.hashtags.join(" ") + " " + p.caption;
    expect(NON_ENGLISH.test(all)).toBe(false);
  });
});

describe("buildPublishPrompt (LLM publishing-copy prompt)", () => {
  it("asks for English output and includes the product/platform", () => {
    const p = buildPublishPrompt({ productName: "Glow Serum", category: "beauty", platform: "tiktok" });
    expect(p).toContain("ENGLISH");
    expect(p).toContain("Glow Serum");
    expect(p).toContain("tiktok");
    expect(NON_ENGLISH.test(p)).toBe(false);
  });
  it("caption leads with the product keyword (search discoverability)", () => {
    expect(buildPublishPrompt({ productName: "Glow Serum", category: "beauty" })).toContain("first ~30 characters for search discoverability");
  });
  it("first hashtag must be product-specific/branded", () => {
    expect(buildPublishPrompt({ productName: "Glow Serum", category: "beauty" })).toContain("product-specific/branded hashtag");
  });
});

describe("buildPublishPack product-specific hashtag", () => {
  it("product-name tag comes first with spaces stripped (Glow Serum → #GlowSerum)", () => {
    const p = buildPublishPack({ productName: "Glow Serum", category: "beauty" });
    expect(p.hashtags[0]).toBe("#GlowSerum");
  });
  it("strips punctuation too", () => {
    expect(buildPublishPack({ productName: "Cloud-Soft Tissues!", category: "home" }).hashtags[0]).toBe("#CloudSoftTissues");
  });
  it("empty product name yields no bare # and falls back to a category tag", () => {
    const p = buildPublishPack({ category: "home" });
    expect(p.hashtags).not.toContain("#");
    expect((p.hashtags[0] || "").length).toBeGreaterThan(1);
  });
  it("the product tag is added on top of category tags, not instead of them", () => {
    const p = buildPublishPack({ productName: "Glow Serum", category: "beauty" });
    expect(p.hashtags[0]).toBe("#GlowSerum");
    expect(p.hashtags).toContain("#BeautyTok");
  });
});

describe("buildAiDeclaration / pack aiDeclaration", () => {
  it("English disclosure, embedded in the pack", () => {
    const d = buildAiDeclaration();
    expect(d.line).toBe("Contains AI-generated content");
    expect(d.notice).toMatch(/C2PA/);
    expect(buildPublishPack({ productName: "juicer" }).aiDeclaration.line).toBe(d.line);
  });
});

describe("commentKit (comment-section ops kit)", () => {
  it("key-free pack: pinned self-Q&A with the name + 2-3 objection templates + compliance notice", () => {
    const pack = buildPublishPack({ productName: "Pour-over Coffee", category: "food", sellingPoints: "a cup in three seconds" });
    expect(pack.commentKit.pinned).toContain("Pour-over Coffee");
    expect(pack.commentKit.objections.length).toBeGreaterThanOrEqual(2);
    expect(pack.commentKit.objections.length).toBeLessThanOrEqual(3);
    for (const o of pack.commentKit.objections) {
      expect(o.q.length).toBeGreaterThan(0);
      expect(o.a.length).toBeGreaterThan(0);
    }
    expect(pack.commentKit.notice).toMatch(/fabricated|fake comments/);
    const all = [pack.commentKit.pinned, pack.commentKit.notice, ...pack.commentKit.objections.flatMap((o) => [o.q, o.a])].join(" ");
    expect(NON_ENGLISH.test(all)).toBe(false);
  });

  it("LLM prompt contract includes commentKit and the anti-fabrication rule", () => {
    const p = buildPublishPrompt({ productName: "Coffee" });
    expect(p).toContain('"commentKit"');
    expect(p.toLowerCase()).toContain("fake customer testimonials");
  });
});
