import { describe, it, expect } from "vitest";
import { LOOK_PRESETS, LOOK_NONE, getLookPreset, lookImageSuffix } from "@/lib/look-presets";
import { buildMotionPrompt } from "@/lib/motion-prompt";

describe("LOOK_PRESETS library integrity", () => {
  it("unique ids; name, image and motion prompt are all non-empty", () => {
    const ids = new Set<string>();
    for (const p of LOOK_PRESETS) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.name.en.length).toBeGreaterThan(0);
      expect(p.image.en.length).toBeGreaterThan(0);
      expect(p.motion.en.length).toBeGreaterThan(0);
    }
  });

  it("motion anchors stay short (camera direction must lead the motion prompt)", () => {
    for (const p of LOOK_PRESETS) {
      expect(p.motion.en.length).toBeLessThan(120);
    }
  });

  it("all preset text is English only", () => {
    for (const p of LOOK_PRESETS) {
      expect(`${p.name.en}${p.image.en}${p.motion.en}${p.opener?.en ?? ""}`).not.toMatch(/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/);
    }
  });
});

describe("getLookPreset / lookImageSuffix", () => {
  it("none and unknown ids → undefined (no style suffix)", () => {
    expect(getLookPreset(LOOK_NONE)).toBeUndefined();
    expect(getLookPreset(undefined)).toBeUndefined();
    expect(getLookPreset("nope")).toBeUndefined();
    expect(lookImageSuffix(LOOK_NONE)).toBeUndefined();
  });

  it("returns the preset's English image suffix", () => {
    const p = LOOK_PRESETS[0];
    expect(lookImageSuffix(p.id)).toBe(p.image.en);
  });
});

describe("buildMotionPrompt look lighting anchor", () => {
  it("passing a look adds a Lighting line", () => {
    const look = getLookPreset("studio_product")!;
    const en = buildMotionPrompt({ shotType: "product_reveal", camera: "slow orbit around the product", look: look.motion });
    expect(en).toContain(`Lighting: ${look.motion.en}`);
  });

  it("without a look the output is unchanged (no Lighting line)", () => {
    const base = buildMotionPrompt({ shotType: "demo", camera: "smooth follow shot" });
    expect(base).not.toContain("Lighting:");
    const look = getLookPreset("warm_life")!.motion;
    const withLook = buildMotionPrompt({ shotType: "demo", camera: "smooth follow shot", look });
    expect(withLook.replace(`. Lighting: ${look.en}`, "")).toBe(base);
  });
});

describe("real-family presets and camera-identity openers", () => {
  it("all six real presets exist and carry an opener (prepended)", () => {
    const real = LOOK_PRESETS.filter((p) => p.group === "real");
    expect(real.map((p) => p.id).sort()).toEqual([
      "cctv_store",
      "dashcam_ride",
      "old_dv",
      "phone_raw",
      "propped_static",
      "selfie_front",
    ]);
    for (const p of real) {
      expect(p.opener?.en).toBeTruthy();
    }
    // styled presets carry no opener (keep the appended lighting-anchor behavior)
    expect(getLookPreset("studio_product")!.opener).toBeUndefined();
  });

  it("the opener is the prompt's first segment (front tokens carry the most weight)", () => {
    const p = getLookPreset("phone_raw")!;
    const en = buildMotionPrompt({ shotType: "demo", camera: "smooth follow shot", look: p.motion, opener: p.opener });
    expect(en.startsWith(`${p.opener!.en}.`)).toBe(true);
  });

  it("without an opener the camera line still leads", () => {
    const base = buildMotionPrompt({ shotType: "demo", camera: "smooth follow shot" });
    expect(base.startsWith("Camera:")).toBe(true);
  });

  it("real-look image suffixes use positive wording only (no negated visual directives)", () => {
    for (const p of LOOK_PRESETS.filter((x) => x.group === "real")) {
      expect(p.image.en.toLowerCase()).not.toMatch(/\bno\b|\bavoid\b/);
    }
  });
});
