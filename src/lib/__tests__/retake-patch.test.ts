import { describe, it, expect } from "vitest";
import { applyRetakePatch, RETAKE_SYMPTOMS } from "@/lib/retake-patch";

describe("applyRetakePatch (single-variable retake from a failed take)", () => {
  const basePrompt = "Camera: slow push-in on the subject. Motion: hands demonstrate naturally and smoothly. Stable, fluid frame.";

  it("six-symptom catalog is complete with English labels", () => {
    expect(RETAKE_SYMPTOMS.map((s) => s.id)).toEqual([
      "face_broken",
      "skin_waxy",
      "background_dead",
      "light_wrong",
      "blurry",
      "product_warped",
    ]);
    for (const s of RETAKE_SYMPTOMS) {
      expect(s.label.en.length).toBeGreaterThan(0);
    }
  });

  it("a patch appends exactly one targeted clause and keeps the original prompt intact", () => {
    const r = applyRetakePatch(basePrompt, "face_broken");
    expect(r.applied).toBe(true);
    expect(r.prompt.startsWith("Camera: slow push-in on the subject")).toBe(true);
    expect(r.prompt).toContain("well-proportioned and symmetrical");
    expect(r.change.en).toContain("face-stability");
    // other symptoms' clauses do not leak in (single variable)
    expect(r.prompt).not.toContain("pores");
    expect(r.prompt).not.toContain("curtains");
  });

  it("idempotent: re-patching a prompt that already has the clause does not append again, applied=false", () => {
    const once = applyRetakePatch(basePrompt, "blurry");
    const twice = applyRetakePatch(once.prompt, "blurry");
    expect(twice.applied).toBe(false);
    expect(twice.prompt).toBe(once.prompt);
  });

  it("patch output stays English", () => {
    const r = applyRetakePatch("Camera: slow push-in. Motion: hands demonstrate naturally.", "skin_waxy");
    expect(r.prompt).toContain("skin keeps pores and natural texture");
    expect(r.prompt).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("different symptoms stack (each changes its own dimension)", () => {
    const a = applyRetakePatch(basePrompt, "light_wrong");
    const b = applyRetakePatch(a.prompt, "background_dead");
    expect(b.applied).toBe(true);
    expect(b.prompt).toContain("single highlight");
    expect(b.prompt).toContain("curtains swaying");
  });
});
