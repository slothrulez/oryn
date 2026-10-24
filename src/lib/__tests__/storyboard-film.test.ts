import { describe, it, expect } from "vitest";
import {
  buildStoryboardFilmPrompt,
  dialogueDensityWarnings,
  filmTotalSeconds,
  filmRequestSeconds,
  resolveFilmModel,
  FILM_MAX_SECONDS,
  FILM_FALLBACK_MODEL,
  estimateFilmSpend,
  parseUnitUsd,
} from "@/lib/storyboard-film";
import type { Shot, ScriptCharacter } from "@/lib/db/schema";

/**
 * Grid-to-film prompt contract (v0.8.84). The exact shape was field-proven on a
 * real product (2026-08): timecoded segments + @ImageN citations + per-segment
 * dialogue produced native 4-shot cutting with verbatim speech on Motion 2.5
 * reference-to-video. These tests pin that shape.
 */

function mkShot(partial: Partial<Shot> & { shotId: number }): Shot {
  return {
    type: "hook",
    duration: 3,
    description: "scene",
    camera: "locked-off",
    visualSource: "ai_generate",
    transition: "direct_concat",
    voiceover: "",
    ...partial,
  } as Shot;
}

const baseShots: Shot[] = [
  mkShot({ shotId: 1, type: "hook", duration: 3, description: "kitchen talking head", voiceover: "This thing saved my wallet" }),
  mkShot({ shotId: 2, type: "demo", duration: 5, description: "squeezing coffee concentrate into ice water", voiceover: "" }),
  mkShot({ shotId: 3, type: "cta", duration: 4, description: "holding up the box to close", voiceover: "Link's right here" }),
];

describe("duration math", () => {
  it("filmTotalSeconds sums; filmRequestSeconds rounds and clamps to 4-30", () => {
    expect(filmTotalSeconds(baseShots)).toBe(12);
    expect(filmRequestSeconds(baseShots)).toBe(12);
    expect(filmRequestSeconds([mkShot({ shotId: 1, duration: 2 })])).toBe(4);
    expect(
      filmRequestSeconds([mkShot({ shotId: 1, duration: 45 })])
    ).toBe(FILM_MAX_SECONDS);
  });
});

describe("film prompt", () => {
  const prompt = buildStoryboardFilmPrompt(baseShots);

  it("per-shot @ImageN citation + type label + timecodes tiling the film by script duration", () => {
    expect(prompt).toContain("[0-3s] Shot 1 (hook shot, framing follows @Image1)");
    expect(prompt).toContain("[3-8s] Shot 2 (demo shot, framing follows @Image2)");
    expect(prompt).toContain("[8-12s] Shot 3 (CTA shot, framing follows @Image3)");
    expect(prompt).toContain("about 12 seconds total, 3 shots");
  });

  it("dialogue uses the official {} bracket syntax; shots without dialogue keep ambient sound only", () => {
    expect(prompt).toContain("Dialogue (spoken verbatim): {This thing saved my wallet}");
    expect(prompt).toContain("{Link's right here}");
    expect(prompt).toContain("(no dialogue — ambient and action sounds only)");
    expect(prompt).toContain("Dialogue language: English.");
  });

  it("global block: consistency + casual delivery + no captions/watermarks + official audio negatives", () => {
    expect(prompt).toContain("same person");
    expect(prompt).toContain("speaks the lines verbatim");
    expect(prompt).toContain("No subtitles");
    // the official negative channel only covers captions and audio: bgm belongs to the composer
    expect(prompt).toContain("No bgm");
  });

  it("reference mapping: without a sheet, @Image1..N are declared as keyframes in order", () => {
    expect(prompt).toContain("Reference mapping: @Image1 through @Image3 are the keyframes for shots 1-3 in order");
  });

  it("texture line defaults to raw phone footage; absent with realism:false", () => {
    expect(prompt).toContain("raw ungraded phone-footage look");
    expect(prompt).toContain("visible pores");
    const styled = buildStoryboardFilmPrompt(baseShots, undefined, undefined, { realism: false });
    expect(styled).not.toContain("raw ungraded phone-footage look");
  });

  it("a single named character becomes the speaker", () => {
    const withCast = buildStoryboardFilmPrompt(baseShots, [{ name: "Lily", appearance: "girl next door" } as never]);
    expect(withCast).toContain("Lily talks to the camera naturally");
  });

  it("scripted camera moves are carried per segment (only when present)", () => {
    const withCam = buildStoryboardFilmPrompt([
      mkShot({ shotId: 1, description: "kitchen", camera: "slow push-in", voiceover: "Hi" }),
      mkShot({ shotId: 2, description: "counter", camera: "", voiceover: "" }),
    ]);
    expect(withCam).toContain("Camera: slow push-in. ");
    // the second shot has no camera → no dangling "Camera:" fragment
    expect(withCam.match(/Camera: /g)?.length).toBe(1);
  });

  it("output is English only", () => {
    expect(prompt).not.toMatch(/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/);
  });
});

describe("reference-sheet slot (characterSheet index offset)", () => {
  it("the sheet leads the reference array: @Image1 = sheet, shot citations shift by +1, mapping shifts too", () => {
    const prompt = buildStoryboardFilmPrompt(baseShots, undefined, { characterSheet: true });
    expect(prompt).toContain("@Image1 is the four-view reference sheet of the presenter");
    expect(prompt).toContain("Shot 1 (hook shot, framing follows @Image2)");
    expect(prompt).toContain("Shot 3 (CTA shot, framing follows @Image4)");
    expect(prompt).not.toContain("framing follows @Image1");
    expect(prompt).toContain("Reference mapping: @Image1 is the presenter's reference sheet (identity only); @Image2 through @Image4");
  });

  it("without a sheet there is no sheet declaration and shots start at @Image1", () => {
    const prompt = buildStoryboardFilmPrompt(baseShots);
    expect(prompt).not.toContain("reference sheet");
    expect(prompt).toContain("framing follows @Image1");
  });
});

describe("dialogue density check (lip-sync drift prevention, only flags extreme overload)", () => {
  it("2.6 words/s cap; shots without dialogue or with zero duration are skipped", () => {
    expect(dialogueDensityWarnings(baseShots)).toEqual([]);
    const en = [
      mkShot({ shotId: 1, duration: 2, description: "kitchen", voiceover: "this is way way too many words to say naturally in two short seconds honestly" }),
      mkShot({ shotId: 2, duration: 0, description: "kitchen", voiceover: "ignored" }),
      mkShot({ shotId: 3, duration: 3, description: "kitchen", voiceover: "" }),
    ];
    const warns = dialogueDensityWarnings(en);
    expect(warns).toHaveLength(1);
    expect(warns[0].index).toBe(0);
    expect(warns[0].limit).toBe(6);
    expect(warns[0].count).toBeGreaterThan(6);
  });
});

describe("timeline scaling for over-long scripts", () => {
  it("40 raw seconds are scaled proportionally into 30; the last segment ends exactly at the total", () => {
    const long: Shot[] = [
      mkShot({ shotId: 1, duration: 20, voiceover: "first half" }),
      mkShot({ shotId: 2, duration: 20, voiceover: "second half" }),
    ];
    const prompt = buildStoryboardFilmPrompt(long);
    expect(prompt).toContain("[0-15s] Shot 1");
    expect(prompt).toContain("[15-30s] Shot 2");
  });
});

describe("multi-character speaker attribution and reference binding", () => {
  const twoCast: ScriptCharacter[] = [
    { id: "char_a", name: "Mia", gender: "female", persona: "sharp-tongued best friend", appearance: "low ponytail, light makeup, loungewear" },
    { id: "char_b", name: "Ben", gender: "male", persona: "soft-hearted", appearance: "short hair, plaid shirt" },
  ];
  const shots = [
    mkShot({ shotId: 1, type: "hook", voiceover: "Your tissues tear on one wipe?", characterId: "char_a" }),
    mkShot({ shotId: 2, type: "demo", voiceover: "Then try this one.", characterId: "char_b" }),
    mkShot({ shotId: 3, type: "cta", voiceover: "Link's right here." }),
  ] as Shot[];

  it("two characters: cast block lists everyone + direction convention + per-line attribution with a short anchor", () => {
    const p = buildStoryboardFilmPrompt(shots, twoCast);
    expect(p).toContain("Cast (refer to characters strictly by these names");
    expect(p).toContain('"left/right" always means screen direction');
    expect(p).toContain("Mia (low ponytail, light makeup, loungewear)");
    expect(p).toContain("Dialogue (spoken verbatim by Mia (low ponytail)): {Your tissues tear on one wipe?}");
    expect(p).toContain("Dialogue (spoken verbatim by Ben (short hair)): {Then try this one.}");
    // narrator shots (no characterId) are not attributed
    expect(p).toContain("Dialogue (spoken verbatim): {Link's right here.}");
    expect(p).toContain("the character named on that shot speaks the line verbatim");
  });

  it("two characters + sheet: the declaration is followed by the backdrop-strip line", () => {
    const p = buildStoryboardFilmPrompt(shots, twoCast, { characterSheet: true });
    expect(p).toContain("never carry the sheet's plain gray studio backdrop");
  });

  it("single character does not regress: soloName speaker line, no per-line attribution", () => {
    const solo: ScriptCharacter[] = [{ id: "char_a", name: "Mia", gender: "female", persona: "", appearance: "low ponytail" }];
    const p = buildStoryboardFilmPrompt(shots.slice(0, 1), solo);
    expect(p).toContain("Mia talks to the camera naturally");
    expect(p).toContain("Dialogue (spoken verbatim): {Your tissues tear on one wipe?}");
    expect(p).not.toContain("by Mia");
    expect(p).toContain("Cast (refer to characters strictly by these names");
  });

  it("single character + sheet: the declaration names that character", () => {
    const solo: ScriptCharacter[] = [{ id: "char_a", name: "Mia", gender: "female", persona: "", appearance: "low ponytail" }];
    const p = buildStoryboardFilmPrompt(shots.slice(0, 1), solo, { characterSheet: true });
    expect(p).toContain("@Image1 is the four-view reference sheet of Mia");
  });

  it("English script: cast block and per-line attribution", () => {
    const enShots = [
      mkShot({ shotId: 1, description: "girl reacts", camera: "push in", voiceover: "This tissue tears instantly?", characterId: "char_a" }),
      mkShot({ shotId: 2, description: "guy demos", camera: "follow", voiceover: "Try this one.", characterId: "char_b" }),
    ] as Shot[];
    const enCast: ScriptCharacter[] = [
      { id: "char_a", name: "Mia", gender: "female", persona: "", appearance: "early 30s, low ponytail, light makeup" },
      { id: "char_b", name: "Ben", gender: "male", persona: "", appearance: "30s, short hair, plaid shirt" },
    ];
    const p = buildStoryboardFilmPrompt(enShots, enCast);
    expect(p).toContain("Cast (refer to characters strictly by these names");
    expect(p).toContain("spoken verbatim by Mia (early 30s");
    expect(p).toContain("the character named on that shot speaks the line verbatim");
  });
});

describe("referenceQuotaCheck (reference-image quota gate before paying)", () => {
  it("models without a known cap are not blocked (allow when unsure)", async () => {
    const { referenceQuotaCheck } = await import("@/lib/storyboard-film");
    expect(referenceQuotaCheck(99, "some/unknown-model")).toEqual({ ok: true, count: 99 });
    expect(referenceQuotaCheck(99, "nova/h3/reference-to-video").ok).toBe(true);
  });
});

/**
 * Model resolution + duration fit (issue #28). The film pass silently swapped the configured
 * model for the flagship fallback and clamped only to the generic 30s cap, so users were billed
 * on a model they never chose, and short-ceiling models returned quietly truncated films.
 */
describe("one-click film: model resolution and duration fit", () => {
  it("resolveFilmModel: reference-to-video models are kept, others fall back and record the replaced model", () => {
    expect(resolveFilmModel("vendorx/wave-3.0/reference-to-video")).toEqual({
      model: "vendorx/wave-3.0/reference-to-video",
    });
    expect(resolveFilmModel("acme/motion-2.0/text-to-video")).toEqual({
      model: FILM_FALLBACK_MODEL,
      swappedFrom: "acme/motion-2.0/text-to-video",
    });
    // nothing configured: fallback with no swap to report
    expect(resolveFilmModel(undefined)).toEqual({ model: FILM_FALLBACK_MODEL });
    expect(resolveFilmModel("   ")).toEqual({ model: FILM_FALLBACK_MODEL });
  });



});

describe("one-click film: spend estimate", () => {
  it("estimateFilmSpend: at the base tier (480p) min=max=unit price x seconds", () => {
    expect(estimateFilmSpend(0.134, 30, { width: 480, height: 854 })).toEqual({
      unitUsd: 0.134, seconds: 30, minUsd: 4.02, maxUsd: 4.02, tierMultiplier: 1,
    });
  });

  it("estimateFilmSpend: tier is decided by the short edge — portrait 720p is 720x1280, not the 1080 tier", () => {
    // measured 2026-09: Wave 3.0 billed $0.40 for 5s @720p — 2x its $0.04 base rate
    const p720 = estimateFilmSpend(0.04, 5, { width: 720, height: 1280 })!;
    expect(p720.tierMultiplier).toBe(2);
    expect(p720.maxUsd).toBe(0.4);
  });

  it("estimateFilmSpend: higher tiers scale the upper bound by measured multipliers (under-reporting is the dangerous direction)", () => {
    // measured 2026-09: Motion 2.5 billed $2.98 for 5s @1080p — 4.45x its $0.134 base rate
    expect(estimateFilmSpend(0.134, 30, { width: 1080, height: 1920 })).toEqual({
      unitUsd: 0.134, seconds: 30, minUsd: 4.02, maxUsd: 18.09, tierMultiplier: 4.5,
    });
    expect(estimateFilmSpend(0.04, 30, { width: 1080, height: 1920 })!.maxUsd).toBe(5.4);
  });

  it("estimateFilmSpend: unknown unit price returns undefined — never treat unknown as $0", () => {
    expect(estimateFilmSpend(undefined, 30)).toBeUndefined();
    expect(estimateFilmSpend(Number.NaN, 30)).toBeUndefined();
    expect(estimateFilmSpend(-1, 30)).toBeUndefined();
    expect(estimateFilmSpend(0.134, 0)).toBeUndefined();
  });

  it("parseUnitUsd: tolerates string prices and dirty values", () => {
    expect(parseUnitUsd("0.134")).toBe(0.134);
    expect(parseUnitUsd(0)).toBe(0);
    expect(parseUnitUsd(undefined)).toBeUndefined();
    expect(parseUnitUsd("")).toBeUndefined();
    expect(parseUnitUsd("free")).toBeUndefined();
  });
});
