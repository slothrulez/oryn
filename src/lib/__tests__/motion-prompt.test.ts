import { describe, it, expect } from "vitest";
import { buildMotionPrompt, hasCameraConflict, pickBehaviorBeats } from "@/lib/motion-prompt";

const NON_ENGLISH = /[\u3000-\u303f\u4e00-\u9fff\uac00-\ud7af\uff00-\uffef]/;

describe("buildMotionPrompt (i2v camera-motion prompt engine)", () => {
  it("the scripted camera field wins and leads the prompt (camera is the primary signal)", () => {
    const p = buildMotionPrompt({ shotType: "hook", camera: "close-up + slow push-in", description: "coffee cup close-up" });
    expect(p.startsWith("Camera: close-up + slow push-in")).toBe(true);
  });

  it("without a camera, uses the shot type's default move (product_reveal → orbit)", () => {
    const p = buildMotionPrompt({ shotType: "product_reveal", description: "product showcase" });
    expect(p).toContain("orbits the product");
    expect(p).toContain("the product itself stays still");
  });

  it("unknown shot types fall back to a generic move without throwing", () => {
    const p = buildMotionPrompt({ shotType: "unknown_type", description: "scene" });
    expect(p).toContain("slow push-in on the subject");
  });

  it("productShot=true adds the product-fidelity constraint (logo/text never distort)", () => {
    const p = buildMotionPrompt({ shotType: "demo", description: "usage demo", productShot: true });
    expect(p).toContain("logo and printed text must remain exactly unchanged");
  });

  it("productShot=false adds no fidelity constraint", () => {
    const p = buildMotionPrompt({ shotType: "hook", description: "opening scene" });
    expect(p).not.toContain("logo");
  });

  it("output is always English", () => {
    const p = buildMotionPrompt({ shotType: "product_reveal", camera: "slow orbit around the product", description: "a skincare bottle on marble" });
    expect(p.startsWith("Camera: slow orbit around the product")).toBe(true);
    expect(p).toContain("no flicker");
    expect(p).not.toMatch(NON_ENGLISH);
  });

  it("empty input still yields a camera line and the stability tail", () => {
    const p = buildMotionPrompt({});
    expect(p).toContain("Camera: ");
    expect(p).toContain("no flicker, no morphing");
  });

  it("the scene description is trimmed to a short semantic anchor (the first frame fixes composition)", () => {
    const long = "a very long scene description ".repeat(20);
    const p = buildMotionPrompt({ shotType: "hook", description: long });
    expect(p.length).toBeLessThan(long.length + 400);
    expect(p).toContain("Scene: a very long scene description");
    expect(p).not.toContain(long.trim());
  });

  it("every known shot type has its own camera and motion language", () => {
    const types = ["hook", "pain_point", "product_reveal", "demo", "social_proof", "cta"] as const;
    const prompts = types.map((t) => buildMotionPrompt({ shotType: t, description: "scene" }));
    expect(new Set(prompts).size).toBe(types.length);
  });
});

describe("prompt engineering pack (intensity / single take / sound / conflict resolution)", () => {
  it("three intensity levels: subtle/strong add wording, normal equals the default baseline", () => {
    const base = buildMotionPrompt({ shotType: "hook", description: "opening" });
    expect(buildMotionPrompt({ shotType: "hook", description: "opening", intensity: "normal" })).toBe(base);
    const subtle = buildMotionPrompt({ shotType: "hook", description: "opening", intensity: "subtle" });
    const strong = buildMotionPrompt({ shotType: "hook", description: "opening", intensity: "strong" });
    expect(subtle).toContain("subtle and restrained");
    expect(strong).toContain("bold pronounced camera movement");
    expect(subtle).not.toBe(strong);
  });

  it("non-chained clips declare one continuous take; chained clips get last-frame guidance; mutually exclusive", () => {
    const plain = buildMotionPrompt({ shotType: "demo", description: "demo" });
    expect(plain).toContain("one continuous single take");
    expect(plain).not.toContain("last frame");
    const chained = buildMotionPrompt({ shotType: "demo", description: "demo", chainToNext: true });
    expect(chained).toContain("last frame");
    expect(chained).not.toContain("no scene changes"); // a chained ending is meant to transition
  });

  it("the sound line is always present and forbids speech (all voiceover comes from TTS)", () => {
    expect(buildMotionPrompt({ shotType: "hook", description: "opening" })).toContain("no speech");
  });

  it("hasCameraConflict: static + moving without sequencing → conflict; sequenced or alone → none", () => {
    expect(hasCameraConflict("static camera with a slow orbit")).toBe(true);
    expect(hasCameraConflict("locked-off shot, orbiting the product")).toBe(true);
    expect(hasCameraConflict("push in, then locked off")).toBe(false);
    expect(hasCameraConflict("static shot")).toBe(false);
    expect(hasCameraConflict("slow orbit")).toBe(false);
  });

  it("a conflicting scripted camera is dropped in favor of the shot type default", () => {
    const p = buildMotionPrompt({ shotType: "product_reveal", camera: "static camera with a slow orbit", description: "product" });
    expect(p).not.toContain("static camera with a slow orbit");
    expect(p).toContain("Camera: camera orbits the product slowly");
  });

  it("talking shots switch to a to-camera speaking action plus two behavior beats (UGC anti-repetition)", () => {
    const p = buildMotionPrompt({ shotType: "hook", description: "a woman talks", talking: true, beatSeed: 0 });
    expect(p).toContain("talks naturally to camera");
    expect(p).toContain("one brief mid-sentence pause");
    // non-talking shots keep the shot type's action unchanged
    expect(buildMotionPrompt({ shotType: "hook", description: "opening" })).toContain("moves eye-catchingly");
  });

  it("behavior beats rotate deterministically: same seed is stable, seeds differ, never a duplicate pair", () => {
    expect(pickBehaviorBeats(3, "en")).toEqual(pickBehaviorBeats(3, "en"));
    expect(pickBehaviorBeats(0, "en")).not.toEqual(pickBehaviorBeats(1, "en"));
    for (const seed of [0, 1, 2, 3, 7, 12, 25]) {
      const [x, y] = pickBehaviorBeats(seed, "en");
      expect(x).toBeTruthy();
      expect(x).not.toBe(y);
    }
  });

  it("talking + personShot keep the real-face constraint and the no-speech sound line", () => {
    const p = buildMotionPrompt({ shotType: "hook", description: "Mia talks", talking: true, personShot: true, beatSeed: 2 });
    expect(p).toContain("ordinary-looking real human");
    expect(p).toContain("no speech");
  });
});

describe("physical realism layers (category constraints / interaction / living background / emotion, single tier)", () => {
  it("productShot + known category → category material constraint appended after the generic one", () => {
    const p = buildMotionPrompt({ shotType: "product_reveal", description: "lipstick showcase", productShot: true, category: "beauty" });
    expect(p).toContain("logo and printed text must remain exactly unchanged");
    expect(p).toContain("cream and liquid textures stay smooth and even");
  });

  it("unknown category (other/empty) adds no category layer", () => {
    const base = buildMotionPrompt({ shotType: "demo", description: "usage demo", productShot: true });
    expect(buildMotionPrompt({ shotType: "demo", description: "usage demo", productShot: true, category: "other" })).toBe(base);
    expect(buildMotionPrompt({ shotType: "demo", description: "usage demo", productShot: true, category: "" })).toBe(base);
  });

  it("demo/product_reveal + category → one action + material-reaction phrase, rotated by beatSeed", () => {
    const a = buildMotionPrompt({ shotType: "demo", description: "taste test", category: "food", beatSeed: 0 });
    const b = buildMotionPrompt({ shotType: "demo", description: "taste test", category: "food", beatSeed: 1 });
    expect(a).toContain("crisp flakes falling");
    expect(b).toContain("steam rises");
    expect(buildMotionPrompt({ shotType: "demo", description: "taste test", category: "food", beatSeed: 0 })).toBe(a);
  });

  it("hook shots are not demonstrations: no interaction phrase even with a category", () => {
    const p = buildMotionPrompt({ shotType: "hook", description: "opening", category: "food", beatSeed: 0 });
    expect(p).not.toContain("crisp flakes falling");
  });

  it("personShot → one living-background element + hair/fabric lag; non-person non-demo shots get neither", () => {
    const person = buildMotionPrompt({ shotType: "pain_point", description: "person frowns", personShot: true, beatSeed: 0 });
    expect(person).toContain("curtains in the background sway gently");
    expect(person).toContain("hair and fabric lag slightly");
    const product = buildMotionPrompt({ shotType: "product_reveal", description: "product", productShot: true });
    expect(product).not.toContain("curtains");
    expect(product).not.toContain("lag slightly");
  });

  it("non-talking person shots get an emotion-process line by shot type; talking shots do not", () => {
    const silent = buildMotionPrompt({ shotType: "pain_point", description: "person troubled", personShot: true, beatSeed: 0 });
    expect(silent).toContain("the brow tightens first");
    const talking = buildMotionPrompt({ shotType: "pain_point", description: "person complains", personShot: true, talking: true, beatSeed: 0 });
    expect(talking).not.toContain("the brow tightens first");
  });

  it("single tier: constraints = category constraint only, off = everything off (legacy shape)", () => {
    const common = { shotType: "demo", description: "demo", productShot: true, personShot: true, beatSeed: 0 } as const;
    const cons = buildMotionPrompt({ ...common, category: "food", realism: "constraints" });
    expect(cons).toContain("vivid natural color");
    expect(cons).not.toContain("crisp flakes falling");
    expect(cons).not.toContain("curtains");
    expect(cons).not.toContain("lag slightly");
    const off = buildMotionPrompt({ ...common, category: "food", realism: "off" });
    expect(off).not.toContain("vivid natural color");
    expect(off).toBe(buildMotionPrompt({ ...common, realism: "off" }));
  });

  it("all realism layers are English", () => {
    const p = buildMotionPrompt({ shotType: "demo", camera: "smooth follow", description: "applying cream", productShot: true, personShot: true, category: "beauty", beatSeed: 0 });
    expect(p).toContain("spreading naturally without clumping");
    expect(p).toContain("gliding open");
    expect(p).toContain("curtains in the background");
    expect(p).not.toMatch(NON_ENGLISH);
  });
});
