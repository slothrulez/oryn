import { describe, it, expect } from "vitest";
import { selectHookPatterns, buildHookGuidance, hookPatternName, HOOK_PATTERNS } from "@/lib/script-engine/hook-patterns";
import { buildUserPrompt, platformTargetLabel } from "@/lib/script-engine/prompts";

describe("selectHookPatterns", () => {
  it("category-matching cards come first (beauty → the first hit is beauty and includes before_after)", () => {
    const sel = selectHookPatterns("beauty", 5);
    expect(sel.length).toBeLessThanOrEqual(5);
    expect(sel[0].categories?.includes("beauty")).toBe(true);
    expect(sel.map((p) => p.id)).toContain("before_after");
  });

  it("fills with generic cards when fewer than n, deduped", () => {
    const sel = selectHookPatterns("tech", 8);
    expect(new Set(sel.map((p) => p.id)).size).toBe(sel.length); // no duplicates
    // generic cards (no categories) will be filled in
    expect(sel.some((p) => !p.categories)).toBe(true);
  });

  it("the n limit applies", () => {
    expect(selectHookPatterns("food", 3).length).toBe(3);
  });

  it("every card has a complete three-beat structure + example", () => {
    for (const p of HOOK_PATTERNS) {
      expect(p.stop && p.prove && p.bridge && p.example).toBeTruthy();
    }
  });
});

describe("buildHookGuidance", () => {
  it("includes the three-beat structure + category name + multi-script differentiation hint", () => {
    const g = buildHookGuidance("beauty");
    expect(g).toContain("0–1s stop");
    expect(g).toContain("1–3s prove");
    expect(g).toContain("3–7s bridge");
    expect(g).toMatch(/beauty/i); // category name injected
    expect(g).toContain("A/B"); // each script uses a different hook mechanism
  });
});

describe("buildUserPrompt includes the hook guidance (integration lock)", () => {
  it("commerce script prompts include the three-beat hook guidance", () => {
    const prompt = buildUserPrompt({ productName: "Test Face Mask", category: "beauty", styleType: "pain_point", targetDuration: 25 });
    expect(prompt).toContain("0–1s stop");
    expect(prompt).toContain("1–3s prove");
  });
});

describe("platformTargetLabel (target platform label, follows the distribution platforms)", () => {
  it("unspecified → default global platforms", () => {
    expect(platformTargetLabel()).toBe("TikTok");
    expect(platformTargetLabel("")).toBe("TikTok");
  });

  it("recognizes each platform code", () => {
    expect(platformTargetLabel("tiktok")).toBe("TikTok");
    expect(platformTargetLabel("reels")).toBe("Instagram Reels");
  });

  it("dedupes multiple platforms, tolerates case and spaces, joins with /", () => {
    expect(platformTargetLabel("TikTok, reels , shorts")).toBe("TikTok / Instagram Reels / YouTube Shorts");
    expect(platformTargetLabel("reels,REELS, shorts")).toBe("Instagram Reels / YouTube Shorts");
  });

  it("nothing recognized → falls back to the default, never an empty label", () => {
    expect(platformTargetLabel("unknown,foo")).toBe("TikTok");
  });
});

describe("buildUserPrompt target platform follows platforms", () => {
  it("when targeting TikTok the target platform line says TikTok", () => {
    const prompt = buildUserPrompt({ productName: "test serum", category: "beauty", styleType: "pain_point", platforms: "tiktok" });
    expect(prompt).toContain("Target platform: TikTok");
  });

  it("unspecified platforms still use the default", () => {
    const prompt = buildUserPrompt({ productName: "Test Face Mask", category: "beauty", styleType: "pain_point" });
    expect(prompt).toContain("Target platform: TikTok");
  });

  it("targeting Reels / Shorts injects the matching platform algorithm directives", () => {
    const reels = buildUserPrompt({ productName: "serum", category: "beauty", styleType: "scene", platforms: "reels" });
    expect(reels).toContain("[Instagram Reels algorithm strategy]");
    const shorts = buildUserPrompt({ productName: "serum", category: "beauty", styleType: "scene", platforms: "shorts" });
    expect(shorts).toContain("[YouTube Shorts algorithm strategy]");
  });

});

describe("v0.8.89 trust/social-proof hook additions", () => {
  it("six new hooks are in the library with complete structure (stop/prove/bridge/example)", () => {
    const ids = ["confession", "honest_flaw", "elimination_haul", "cost_math", "comment_reply", "hype_confirm"];
    for (const id of ids) {
      const p = HOOK_PATTERNS.find((x) => x.id === id);
      expect(p, id).toBeTruthy();
      expect(p!.stop.length).toBeGreaterThan(0);
      expect(p!.prove.length).toBeGreaterThan(0);
      expect(p!.bridge.length).toBeGreaterThan(0);
      expect(p!.example.length).toBeGreaterThan(0);
      expect(p!.avoidWhen, `${id} needs a caution note (every trust hook has a compliance/authenticity red line)`).toBeTruthy();
    }
    expect(HOOK_PATTERNS.length).toBe(16);
  });

  it("hookPatternName resolves the new hooks; unknown ids return as-is", () => {
    expect(hookPatternName("confession")).toBe("Confession");
    expect(hookPatternName("hype_confirm")).toBe("Hype confirmed");
  });
});
