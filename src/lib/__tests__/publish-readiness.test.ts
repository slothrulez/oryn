import { describe, it, expect } from "vitest";
import { checkPublishReadiness } from "@/lib/publish-readiness";
import type { Shot } from "@/lib/db/schema";

const mk = (o: Partial<Shot>): Shot => ({
  shotId: 1,
  type: "demo",
  duration: 5,
  description: "",
  camera: "",
  visualSource: "ai_generate",
  transition: "direct_concat",
  voiceover: "",
  ...o,
});

const item = (r: ReturnType<typeof checkPublishReadiness>, key: string) => r.items.find((i) => i.key === key);

describe("checkPublishReadiness", () => {
  const good: Shot[] = [
    mk({ shotId: 1, type: "hook", duration: 3, voiceover: "Still fighting an oily face?" }),
    mk({ shotId: 2, type: "product_reveal", duration: 12, voiceover: "This amino-acid cleanser is gentle and never stings" }),
    mk({ shotId: 3, type: "cta", duration: 6, voiceover: "Tap the cart below to grab it" }),
  ];

  it("healthy script → ready, no warn/fail", () => {
    const r = checkPublishReadiness(good, 30, { aigcLabel: true });
    expect(r.overall).toBe("ready");
    expect(r.fail).toBe(0);
    expect(r.warn).toBe(0);
    expect(item(r, "aigc")?.status).toBe("pass");
  });

  it("ad-law risk words → compliance fail → needsWork (with the matched terms)", () => {
    const r = checkPublishReadiness([mk({ type: "hook", duration: 3, voiceover: "The world's best mask, lowest price ever" })], 20);
    expect(item(r, "compliance")?.status).toBe("fail");
    expect(item(r, "compliance")?.message).toContain("world's best");
    expect(r.overall).toBe("needsWork");
  });

  it("opening hook too long (>4s) → hook warn", () => {
    const r = checkPublishReadiness([mk({ type: "hook", duration: 6, voiceover: "Still worried about it?" }), ...good.slice(1)], 30);
    expect(item(r, "hook")?.status).toBe("warn");
  });

  it("flat opening hook (no question/number/pain point) → hook warn", () => {
    const r = checkPublishReadiness([mk({ type: "hook", duration: 3, voiceover: "Let me introduce a face mask to everyone today" }), ...good.slice(1)], 30);
    expect(item(r, "hook")?.status).toBe("warn");
  });

  it("hook with a 'still' pain-point signal → hook pass", () => {
    const r = checkPublishReadiness(good, 30);
    expect(item(r, "hook")?.status).toBe("pass");
  });

  it("too short/too long → duration warn", () => {
    expect(item(checkPublishReadiness(good, 10), "duration")?.status).toBe("warn");
    expect(item(checkPublishReadiness(good, 70), "duration")?.status).toBe("warn");
    expect(item(checkPublishReadiness(good, 30), "duration")?.status).toBe("pass");
  });

  it("captions too dense (characters/second over the threshold) → caption warn naming the shot", () => {
    const dense = mk({ shotId: 2, type: "demo", duration: 2, voiceover: "this is a really really long subtitle line that nobody could possibly read in two seconds at all honestly" });
    const r = checkPublishReadiness([good[0], dense, good[2]], 30);
    expect(item(r, "caption")?.status).toBe("warn");
    expect(item(r, "caption")?.message).toContain("2");
  });

  it("no call to action → cta warn", () => {
    const r = checkPublishReadiness([mk({ type: "hook", voiceover: "Still worried?" }), mk({ type: "demo", voiceover: "The product works well" })], 25);
    expect(item(r, "cta")?.status).toBe("warn");
  });

  it("missing structure sections (hook only) → structure warn", () => {
    const r = checkPublishReadiness([mk({ type: "hook", voiceover: "Still worried?" })], 25);
    expect(item(r, "structure")?.status).toBe("warn");
  });

  it("AIGC label: false→warn, true→pass, omitted→item not shown", () => {
    expect(item(checkPublishReadiness(good, 30, { aigcLabel: false }), "aigc")?.status).toBe("warn");
    expect(item(checkPublishReadiness(good, 30, { aigcLabel: true }), "aigc")?.status).toBe("pass");
    expect(item(checkPublishReadiness(good, 30, {}), "aigc")).toBeUndefined();
  });

  it("English copy", () => {
    const r = checkPublishReadiness([mk({ type: "hook", voiceover: "world's best" })], 30);
    expect(item(r, "compliance")?.message).toMatch(/ad-law/);
  });

  it("overall priority: any fail means needsWork (even with passes)", () => {
    const r = checkPublishReadiness([mk({ type: "hook", duration: 3, voiceover: "The world's best product, what are you waiting for?" }), ...good.slice(1)], 30, { aigcLabel: true });
    expect(r.fail).toBeGreaterThan(0);
    expect(r.overall).toBe("needsWork");
  });
});

describe("product-in-first-3-seconds hard rule (productEarly)", () => {
  const name = "Amino Cleanser";
  // story-first template: 3 shots of scene-setting, product only appears at ~11s
  const storyFirst: Shot[] = [
    mk({ shotId: 1, type: "hook", duration: 3, voiceover: "Still fighting oily skin?" }),
    mk({ shotId: 2, type: "pain_point", duration: 4, voiceover: "My face feels tight and stings after every wash" }),
    mk({ shotId: 3, type: "social_proof", duration: 4, voiceover: "and seasonal changes make it worse" }),
    mk({ shotId: 4, type: "product_reveal", duration: 8, voiceover: `${name} is gentle and never stings` }),
    mk({ shotId: 5, type: "cta", duration: 5, voiceover: "Tap the cart below" }),
  ];
  const item = (r: ReturnType<typeof checkPublishReadiness>, key: string) => r.items.find((i) => i.key === key);

  it("no productName (topic video) → item not shown", () => {
    expect(item(checkPublishReadiness(storyFirst, 24, {}), "productEarly")).toBeUndefined();
  });

  it("first shot includes the product (product_image asset or product name mentioned) → pass", () => {
    const early = [mk({ shotId: 1, type: "hook", duration: 3, visualSource: "product_image", voiceover: "Still picking cleansers at random?" }), ...storyFirst.slice(3)];
    expect(item(checkPublishReadiness(early, 16, { productName: name }), "productEarly")?.status).toBe("pass");
    const mention = [mk({ shotId: 1, type: "hook", duration: 3, voiceover: `Why ${name} is selling out` }), ...storyFirst.slice(3)];
    expect(item(checkPublishReadiness(mention, 16, { productName: name }), "productEarly")?.status).toBe("pass");
  });

  it("product first appears at 3-7 seconds → warn; after 7 seconds → fail with the throttling reason", () => {
    // 3s hook + 2s scene → product first appears at 5s (the 3s boundary itself passes: a 3s hook then the product is the standard healthy shape)
    const mid = [
      storyFirst[0],
      mk({ shotId: 2, type: "social_proof", duration: 2, voiceover: "Seasonal changes make it worse" }),
      mk({ shotId: 3, type: "product_reveal", duration: 8, voiceover: `${name} works` }),
      storyFirst[4],
    ];
    expect(item(checkPublishReadiness(mid, 18, { productName: name }), "productEarly")?.status).toBe("warn");
    const late = checkPublishReadiness(storyFirst, 24, { productName: name });
    expect(item(late, "productEarly")?.status).toBe("fail");
    expect(item(late, "productEarly")?.message).toContain("completion-baiting");
    expect(late.overall).toBe("needsWork");
  });

  it("no product at all → fail (never-appears branch) with English copy", () => {
    const none: Shot[] = [
      mk({ shotId: 1, type: "hook", duration: 3, voiceover: "Still worried?" }),
      mk({ shotId: 2, type: "social_proof", duration: 10, voiceover: "That's just life" }),
    ];
    const en = item(checkPublishReadiness(none, 13, { productName: name }), "productEarly");
    expect(en?.status).toBe("fail");
    expect(en?.message).toMatch(/never clearly appears/);
  });

  it("a textOverlay mentioning the product name also counts as exposure", () => {
    const overlay = [
      mk({ shotId: 1, type: "hook", duration: 3, voiceover: "Still choosing at random?", textOverlay: { text: `${name} tested`, style: "title" } as Shot["textOverlay"] }),
      ...storyFirst.slice(3),
    ];
    expect(item(checkPublishReadiness(overlay, 16, { productName: name }), "productEarly")?.status).toBe("pass");
  });
});
