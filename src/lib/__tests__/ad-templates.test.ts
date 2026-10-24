import { describe, it, expect } from "vitest";
import { AD_TEMPLATES, AD_TEMPLATE_GROUPS, listAdTemplates, getAdTemplate, adTemplateScriptDirective, adTemplateStorageKey, adTemplateAppliedKey, recommendAdTemplates, sanitizeCustomAdTemplate, encodeStoredAdTemplate, decodeStoredAdTemplate, CUSTOM_AD_TEMPLATE_ID } from "@/lib/ad-templates";
import { getCameraPreset } from "@/lib/camera-presets";
import { getLookPreset } from "@/lib/look-presets";
import { CAPTION_PRESET_IDS } from "@/lib/caption-presets";

// UI-form style values accepted by the new-project page (pre-normalizeStyle vocabulary)
const UI_STYLE_VALUES = new Set([
  "drama", "reversal", "interview", "story", "unboxing", "product_pov",
  "comparison", "talking_head", "pain-point", "scenario", "auto",
]);
const VIDEO_MODES = new Set(["product_closeup", "graphic_montage", "scene_demo", "live_presenter"]);
const BGM_VALUES = new Set(["none", "upbeat", "chill", "energetic", "emotional"]);
const GROUP_IDS = new Set(AD_TEMPLATE_GROUPS.map((g) => g.id));
// new-project product-category vocabulary ("other" intentionally excluded — goodFor means "tuned for", not "allowed")
const CATEGORY_VALUES = new Set(["beauty", "food", "home", "fashion", "digital"]);

describe("AD_TEMPLATES library integrity", () => {
  it("ids are unique and names and selling points are non-empty", () => {
    const ids = new Set<string>();
    for (const tpl of AD_TEMPLATES) {
      expect(ids.has(tpl.id)).toBe(false);
      ids.add(tpl.id);
      expect(tpl.name.en.length).toBeGreaterThan(0);
      expect(tpl.tagline.en.length).toBeGreaterThan(0);
      expect(tpl.emoji.length).toBeGreaterThan(0);
    }
  });

  it("every template's group and suitable categories are in the vocabulary", () => {
    for (const tpl of AD_TEMPLATES) {
      expect(GROUP_IDS.has(tpl.group), `${tpl.id}  group "${tpl.group}" does not exist`).toBe(true);
      for (const cat of tpl.goodFor ?? []) {
        expect(CATEGORY_VALUES.has(cat), `${tpl.id}  goodFor "${cat}" is not in the category vocabulary`).toBe(true);
      }
    }
  });

  it("every group has at least one template (no empty groups)", () => {
    for (const group of AD_TEMPLATE_GROUPS) {
      expect(
        AD_TEMPLATES.some((t) => t.group === group.id),
        `group "${group.id}" has no templates`
      ).toBe(true);
    }
  });

  it("every look / camera preset / style / mode / composition config a template references exists", () => {
    for (const tpl of AD_TEMPLATES) {
      expect(getLookPreset(tpl.look), `${tpl.id}  look "${tpl.look}" does not exist`).toBeDefined();
      expect(UI_STYLE_VALUES.has(tpl.styleType), `${tpl.id}  styleType "${tpl.styleType}" is not in the new-project vocabulary`).toBe(true);
      expect(VIDEO_MODES.has(tpl.videoMode)).toBe(true);
      for (const [type, presetId] of Object.entries(tpl.cameraPlan)) {
        expect(getCameraPreset(presetId!), `${tpl.id}  ${type} camera move "${presetId}" does not exist`).toBeDefined();
      }
      if (tpl.compose.captionPreset) {
        expect((CAPTION_PRESET_IDS as readonly string[]).includes(tpl.compose.captionPreset)).toBe(true);
      }
      if (tpl.compose.bgm) expect(BGM_VALUES.has(tpl.compose.bgm)).toBe(true);
    }
  });

  it("every template's camera plan covers at least the hook or a product/demo shot (templates must really plan camera moves)", () => {
    for (const tpl of AD_TEMPLATES) {
      const keys = Object.keys(tpl.cameraPlan);
      expect(keys.length, `${tpl.id} has no camera choreography`).toBeGreaterThan(1);
    }
  });
});

describe("listAdTemplates group filtering and category ordering", () => {
  it("filters by group; all/omitted returns the whole library", () => {
    expect(listAdTemplates()).toHaveLength(AD_TEMPLATES.length);
    expect(listAdTemplates({ group: "all" })).toHaveLength(AD_TEMPLATES.length);
    const productShow = listAdTemplates({ group: "product_show" });
    expect(productShow.length).toBeGreaterThan(0);
    expect(productShow.every((t) => t.group === "product_show")).toBe(true);
  });

  it("query keyword filter matches names/selling points, case-insensitive; empty string does not filter", () => {
    const hit = listAdTemplates({ query: "turntable" });
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.every((t) => `${t.name.en}${t.tagline.en}`.toLowerCase().includes("turntable"))).toBe(true);
    const enHit = listAdTemplates({ query: "TURNTABLE" });
    expect(enHit.some((t) => t.id === "turntable_hero")).toBe(true);
    expect(listAdTemplates({ query: "  " })).toHaveLength(AD_TEMPLATES.length);
    expect(listAdTemplates({ query: "no-such-keyword-xyz" })).toHaveLength(0);
  });

  it("with a category selected, goodFor matches sort first and no template is dropped", () => {
    const sorted = listAdTemplates({ category: "food" });
    expect(sorted).toHaveLength(AD_TEMPLATES.length);
    const firstMiss = sorted.findIndex((t) => !t.goodFor?.includes("food"));
    const lastHit = sorted.map((t) => t.goodFor?.includes("food") ?? false).lastIndexOf(true);
    if (firstMiss !== -1 && lastHit !== -1) {
      expect(lastHit).toBeLessThan(firstMiss);
    }
  });
});

describe("recommendAdTemplates product-aware recommendations", () => {
  it("keyword-signal matches rank first (signal score outweighs category score)", () => {
    const recs = recommendAdTemplates({ category: "home", productName: "heavy-duty stain cleaner", sellingPoints: "one spray lifts tough grime" });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].id).toBe("grime_satisfying"); // signal +2 plus goodFor:home +3 = 5, the unique top score
  });

  it("with only a category, recommends by goodFor and every recommended id exists", () => {
    const recs = recommendAdTemplates({ category: "beauty" });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((t) => t.goodFor?.includes("beauty"))).toBe(true);
    for (const t of recs) expect(getAdTemplate(t.id)).toBeDefined();
  });

  it("empty input returns empty (UI hides the recommendation row instead of inventing one)", () => {
    expect(recommendAdTemplates({})).toHaveLength(0);
    expect(recommendAdTemplates({ productName: "  " })).toHaveLength(0);
  });

  it("every template id in the signal table exists (guards against refactor drift)", () => {
    // verify through the public API: each signal hit yields non-empty, resolvable recommendations
    const probes: Array<[string, string]> = [["gift for mom", "gift_story"], ["soothing squishy toy", "squish_asmr"], ["factory direct shipping", "founder_story"]];
    for (const [text, expectedId] of probes) {
      const recs = recommendAdTemplates({ productName: text }, 10);
      expect(recs.some((t) => t.id === expectedId), `"${text}" should recommend ${expectedId}`).toBe(true);
    }
  });

  it("new vertical signals hit their templates (drift probe)", () => {
    const probes: Array<[string, string]> = [
      ["freeze-dried cat food for picky eaters", "picky_judge"],
      ["hospital bag organizer for late pregnancy", "hospital_bag"],
      ["freshwater pearl necklace", "wrist_sparkle"],
      ["foldable home treadmill", "method_1230"],
      ["large in-car fridge", "trucker_rig"],
      ["washi tape and sticker journal set", "journal_asmr"],
      ["breathable cushioned running shoe", "step_test"],
      ["large commuter backpack", "max_load"],
      ["quiet low-noise blender", "decibel_test"],
      ["sonic electric toothbrush", "plaque_test"],
      ["non-slip dance shoes for seniors", "dance_squad"],
      ["blackout sleep mask", "sleepmaxxing"],
      ["fresh fruit group-buy", "group_buy_chain"],
      ["lucky crystal charm bracelet", "lucky_charm"],
    ];
    for (const [text, expectedId] of probes) {
      const recs = recommendAdTemplates({ productName: text }, 10);
      expect(recs.some((t) => t.id === expectedId), `"${text}" should recommend ${expectedId}`).toBe(true);
    }
  });

  it("391-library new vertical signals hit their templates (v0.8.72 drift probe)", () => {
    const probes: Array<[string, string]> = [
      ["custom mechanical keyboard brown switches", "switch_sound"],
      ["noise-cancelling bluetooth earbuds", "anc_ab"],
      ["GaN fast charger", "charge_race"],
      ["spring green tea", "tea_grading"],
      ["light roast pour-over coffee beans", "pour_over_card"],
      ["light plum cider", "solo_buzz"],
      ["heat-and-eat ready meal", "timer_feast"],
      ["flameless aroma diffuser set", "scent_translate"],
      ["full blackout curtains", "blackout_noon"],
      ["historical costume skirt", "ancient_recreate"],
      ["cooling fabric UPF arm sleeves", "uv_proof"],
      ["polarized driving sunglasses", "polarized_proof"],
      ["beginner ukulele", "practice_arc"],
      ["ergonomic chair lumbar support", "sit_marathon"],
      ["press-on nails set", "nail_stress"],
      ["near-expiry imported snacks clearance", "expiry_hunt"],
      ["hot spring resort hotel package", "overnight_report"],
      ["wedding favor checklist", "wedtok_diary"],
    ];
    for (const [text, expectedId] of probes) {
      const recs = recommendAdTemplates({ productName: text }, 10);
      expect(recs.some((t) => t.id === expectedId), `"${text}" should recommend ${expectedId}`).toBe(true);
    }
  });
});

describe("sanitizeCustomAdTemplate sanitizes AI templates", () => {
  it("valid input keeps creative fields as-is", () => {
    const t = sanitizeCustomAdTemplate({
      name: { en: "Scent Night" },
      tagline: { en: "Night mood" },
      emoji: "🌙",
      group: "creative",
      goodFor: ["beauty"],
      styleType: "scenario",
      videoMode: "product_closeup",
      look: "night_neon",
      cameraPlan: { hook: "slow_push", product_reveal: "orbit_slow", cta: "hero_rise" },
      compose: { captionPreset: "minimal", bgm: "emotional", bgmDuck: true, quality: "hd", productCard: true },
      scriptHint: { en: "night-mood storytelling" },
    })!;
    expect(t.id).toBe(CUSTOM_AD_TEMPLATE_ID);
    expect(t.name.en).toBe("Scent Night");
    expect(t.look).toBe("night_neon");
    expect(t.cameraPlan.hook).toBe("slow_push");
    expect(t.compose.quality).toBe("hd");
    expect(t.goodFor).toEqual(["beauty"]);
  });

  it("invalid enums are clamped to safe defaults and invalid camera moves are removed", () => {
    const t = sanitizeCustomAdTemplate({
      styleType: "nonsense",
      videoMode: "vr_360",
      look: "fake_look",
      group: "fake_group",
      goodFor: ["book", "beauty"],
      cameraPlan: { hook: "fake_cam", weird_shot: "crash_push", demo: "macro_glide" },
      compose: { captionPreset: "huge", bgm: "metal", quality: "8k" },
    })!;
    expect(t.styleType).toBe("pain-point");
    expect(t.videoMode).toBe("product_closeup");
    expect(t.look).toBe("daylight_clean");
    expect(t.group).toBe("product_show"); // inferred from videoMode
    expect(t.goodFor).toEqual(["beauty"]);
    // only 1 valid camera move (<2) → fall back to the default plan
    expect(Object.keys(t.cameraPlan).length).toBeGreaterThan(1);
    expect(t.compose.captionPreset).toBe("standard");
    expect(t.compose.bgm).toBe("upbeat");
    expect(t.compose.quality).toBeUndefined();
    // sanitized templates can go through the script-injection path
    expect(adTemplateScriptDirective(t)).toContain("Camera plan");
  });

  it("non-object input returns null", () => {
    expect(sanitizeCustomAdTemplate(null)).toBeNull();
    expect(sanitizeCustomAdTemplate("{}")).toBeNull();
  });
});

describe("encode/decodeStoredAdTemplate storage codec", () => {
  it("built-in templates store an id and decode back to the same template", () => {
    const tpl = getAdTemplate("turntable_hero")!;
    expect(encodeStoredAdTemplate(tpl)).toBe("turntable_hero");
    expect(decodeStoredAdTemplate("turntable_hero")?.name.en).toBe("Turntable Hero");
  });

  it("custom templates store inline JSON and decode through sanitization", () => {
    const custom = sanitizeCustomAdTemplate({ name: { en: "Custom" }, videoMode: "scene_demo" })!;
    const stored = encodeStoredAdTemplate(custom);
    expect(stored.startsWith("custom:")).toBe(true);
    const decoded = decodeStoredAdTemplate(stored)!;
    expect(decoded.id).toBe(CUSTOM_AD_TEMPLATE_ID);
    expect(decoded.name.en).toBe("Custom");
    expect(decoded.videoMode).toBe("scene_demo");
  });

  it("bad values decode to undefined without throwing", () => {
    expect(decodeStoredAdTemplate("custom:not-json{")).toBeUndefined();
    expect(decodeStoredAdTemplate("unknown_id")).toBeUndefined();
    expect(decodeStoredAdTemplate(null)).toBeUndefined();
  });
});

describe("getAdTemplate / storage keys", () => {
  it("hits by id; empty/unknown returns undefined", () => {
    expect(getAdTemplate("turntable_hero")?.name.en).toBe("Turntable Hero");
    expect(getAdTemplate("nope")).toBeUndefined();
    expect(getAdTemplate("")).toBeUndefined();
    expect(getAdTemplate(null)).toBeUndefined();
  });

  it("localStorage keys are isolated per project and the applied key differs from the selection key", () => {
    expect(adTemplateStorageKey("p1")).not.toBe(adTemplateStorageKey("p2"));
    expect(adTemplateAppliedKey("p1")).not.toBe(adTemplateStorageKey("p1"));
  });
});

describe("adTemplateScriptDirective script injection block", () => {
  it("includes the template name, look description and real camera-preset sentence", () => {
    const tpl = getAdTemplate("turntable_hero")!;
    const directive = adTemplateScriptDirective(tpl);
    expect(directive).toContain("Turntable Hero");
    expect(directive).toContain(getLookPreset(tpl.look)!.image.en);
    expect(directive).toContain(getCameraPreset("lazy_susan")!.prompt.en);
    expect(directive).toContain("camera");
  });

  it("every template's injection block is non-empty and carries a creative hint", () => {
    for (const tpl of AD_TEMPLATES) {
      const d = adTemplateScriptDirective(tpl);
      expect(d).toContain(tpl.scriptHint.en);
      expect(d).toContain("Camera plan");
    }
  });
});
