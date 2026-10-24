import { describe, it, expect } from "vitest";
import {
  CAMERA_PRESETS,
  CAMERA_PRESET_CATEGORIES,
  getCameraPreset,
  cameraPresetPrompt,
  recommendedPresets,
  cameraPresetGuide,
  findPresetByPrompt,
  mixCameraPrompt,
  mixablePresets,
} from "@/lib/camera-presets";
import { hasCameraConflict, buildMotionPrompt } from "@/lib/motion-prompt";

const SHOT_TYPES = ["hook", "pain_point", "product_reveal", "demo", "social_proof", "cta"] as const;

describe("CAMERA_PRESETS library integrity", () => {
  it("ids are unique and names and prompts are non-empty", () => {
    const ids = new Set<string>();
    for (const p of CAMERA_PRESETS) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.name.en.length).toBeGreaterThan(0);
      expect(p.prompt.en.length).toBeGreaterThan(0);
      expect(CAMERA_PRESET_CATEGORIES[p.category]).toBeDefined();
    }
  });

  it("every preset sentence must pass the camera-conflict lint, otherwise buildMotionPrompt drops it and falls back", () => {
    for (const p of CAMERA_PRESETS) {
      expect(hasCameraConflict(p.prompt.en), `${p.id} en preset sentence triggers the conflict lint`).toBe(false);
    }
  });

  it("preset sentences really flow into the motion prompt (not replaced by the shotType default)", () => {
    for (const p of CAMERA_PRESETS) {
      const out = buildMotionPrompt({ shotType: "demo", camera: p.prompt.en });
      expect(out).toContain(`Camera: ${p.prompt.en}`);
    }
  });

  it("all six shot types are covered by recommended presets", () => {
    for (const type of SHOT_TYPES) {
      expect(recommendedPresets(type).length, `${type} no recommended presets`).toBeGreaterThan(0);
    }
  });

  it("unknown shot types return an empty recommendation instead of erroring", () => {
    expect(recommendedPresets("unknown_type")).toEqual([]);
  });
});

describe("lookup", () => {
  it("getCameraPreset hits by id; unknown ids return undefined", () => {
    expect(getCameraPreset("orbit_slow")?.name.en).toBe("Slow Orbit");
    expect(getCameraPreset("nope")).toBeUndefined();
  });

  it("cameraPresetPrompt returns the English preset sentence", () => {
    const p = getCameraPreset("slow_push")!;
    expect(cameraPresetPrompt(p, "a kitchen scene")).toBe(p.prompt.en);
    expect(cameraPresetPrompt(p, "an english scene description")).toBe(p.prompt.en);
    expect(cameraPresetPrompt(p, "")).toBe(p.prompt.en);
  });
});

describe("Mix: combining two presets", () => {
  it("findPresetByPrompt reverse-looks-up by exact preset sentence; non-preset text returns undefined", () => {
    const p = getCameraPreset("orbit_slow")!;
    expect(findPresetByPrompt(p.prompt.en)?.id).toBe("orbit_slow");
    expect(findPresetByPrompt(p.prompt.en)?.id).toBe("orbit_slow");
    expect(findPresetByPrompt("camera just wiggles around")).toBeUndefined();
    expect(findPresetByPrompt(undefined)).toBeUndefined();
  });

  it("mixable combinations produce a 'while' compound sentence that passes the conflict lint", () => {
    const orbit = getCameraPreset("orbit_slow")!;
    const push = getCameraPreset("slow_push")!;
    const out = mixCameraPrompt(orbit, push, "kitchen scene");
    expect(out).toBe(`${orbit.prompt.en}, while ${push.prompt.en}`);
    expect(hasCameraConflict(out!)).toBe(false);
    const en = mixCameraPrompt(orbit, push, "english scene");
    expect(en).toContain(", while ");
  });

  it("mixing locked-camera presets (turntable/focus pull) with motion presets conflicts → null", () => {
    const lazy = getCameraPreset("lazy_susan")!;
    const orbit = getCameraPreset("orbit_slow")!;
    expect(mixCameraPrompt(lazy, orbit, "scene")).toBeNull();
    expect(mixCameraPrompt(orbit, lazy, "scene")).toBeNull();
  });

  it("a preset cannot mix with itself; mixablePresets lists only lint-passing candidates", () => {
    const orbit = getCameraPreset("orbit_slow")!;
    expect(mixCameraPrompt(orbit, orbit, "scene")).toBeNull();
    const candidates = mixablePresets(orbit, "scene");
    expect(candidates.some((p) => p.id === "orbit_slow")).toBe(false);
    expect(candidates.some((p) => p.id === "lazy_susan")).toBe(false);
    expect(candidates.length).toBeGreaterThan(0);
    for (const p of candidates) {
      expect(hasCameraConflict(mixCameraPrompt(orbit, p, "scene")!)).toBe(false);
    }
  });

  it("mixed sentences really flow into the motion prompt without fallback", () => {
    const mixed = mixCameraPrompt(getCameraPreset("orbit_slow")!, getCameraPreset("slow_push")!, "scene")!;
    expect(buildMotionPrompt({ shotType: "product_reveal", camera: mixed })).toContain(`Camera: ${mixed}`);
  });
});

describe("cameraPresetGuide script-LLM vocabulary", () => {
  it("covers the six shot-intent labels and includes real preset sentences", () => {
    const guide = cameraPresetGuide();
    for (const label of ["Opening hook", "Pain point", "Product reveal", "Demo", "Social proof", "Closing CTA"]) {
      expect(guide).toContain(label);
    }
    expect(guide).toContain(getCameraPreset("orbit_slow")!.prompt.en);
    // The guide must carry the conflict rule so the LLM doesn't mix hold + move in one line
    expect(guide).toContain("camera vocabulary");
  });
});
