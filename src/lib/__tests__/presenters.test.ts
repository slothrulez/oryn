import { describe, it, expect } from "vitest";
import {PRESENTER_PRESETS, REAL_FACE_CONSTRAINT, realFaceLine, presenterPromptBlock, SPOKEN_VOICE_RULES, UGC_FIRST_FRAME_RULES } from "@/lib/presenters";
import { buildMotionPrompt } from "@/lib/motion-prompt";
import { stylePrompts } from "@/lib/script-engine/prompts";
import { buildAssetRows } from "@/lib/assets-view";
import type { Shot } from "@/lib/db/schema";

describe("built-in presenter library and real-face constraint", () => {
  it("6 presets: unique ids, valid genders, every look includes an everyday-person description", () => {
    expect(PRESENTER_PRESETS).toHaveLength(6);
    expect(new Set(PRESENTER_PRESETS.map((p) => p.id)).size).toBe(6);
    for (const p of PRESENTER_PRESETS) {
      expect(["female", "male"]).toContain(p.gender);
      expect(p.appearance).toMatch(/approachable|pleasant|easy on the eyes|friendly|kind|natural/i);
    }
  });

  it("real-face constraint bans both influencer faces and deliberate uglifying", () => {
    expect(REAL_FACE_CONSTRAINT.en).toContain("influencer");
    expect(REAL_FACE_CONSTRAINT.en).toContain("deliberately");
    expect(REAL_FACE_CONSTRAINT.en).toContain("influencer");
    expect(REAL_FACE_CONSTRAINT.en).toContain("deliberately unattractive");
  });

  it("realFaceLine returns the English constraint", () => {
    expect(realFaceLine("girl at a bedroom vanity")).toBe(REAL_FACE_CONSTRAINT.en);
    expect(realFaceLine("a woman at a vanity table")).toBe(REAL_FACE_CONSTRAINT.en);
    expect(realFaceLine("")).toBe(REAL_FACE_CONSTRAINT.en);
  });

  it("the presenter library text includes every preset name (for the LLM to choose from)", () => {
    const block = presenterPromptBlock();
    for (const p of PRESENTER_PRESETS) expect(block).toContain(p.name);
  });
});

describe("real-face constraint injection chain", () => {
  it("motion prompt: personShot=true injects the constraint, false does not", () => {
    const out = buildMotionPrompt({ shotType: "hook", description: "woman talking to the camera", personShot: true });
    expect(out).toContain("influencer");
    const en = buildMotionPrompt({ shotType: "hook", description: "a woman talks to camera", personShot: true });
    expect(en).toContain("influencer");
    expect(buildMotionPrompt({ shotType: "hook", description: "woman talking to the camera" })).not.toContain("influencer");
  });

  it("dialogue/talking-head style formulas carry the everyday-person requirement and the built-in presenter library", () => {
    for (const s of ["drama", "interview", "talking_head"] as const) {
      expect(stylePrompts[s], s).toMatch(/everyday|ordinary/i);
      expect(stylePrompts[s], s).toContain("Built-in everyday presenter library");
    }
  });

  it("buildAssetRows passes characterId through (the signal that triggers the constraint)", () => {
    const shot = {
      shotId: 1, type: "hook", duration: 3, description: "Mia talking", camera: "",
      visualSource: "ai_generate", transition: "cut", voiceover: "line", characterId: "char_a",
    } as unknown as Shot;
    const rows = buildAssetRows([shot], [], []);
    expect(rows[0].characterId).toBe("char_a");
  });

  it("spoken realism rule: it is said, not written (core UGC methodology assertion)", () => {
    expect(SPOKEN_VOICE_RULES).toContain("sound spoken, not written");
    expect(SPOKEN_VOICE_RULES).toContain("mid-conversation");
    expect(SPOKEN_VOICE_RULES).toContain("Hi everyone");
    expect(SPOKEN_VOICE_RULES).toContain("slogan");
  });

  it("first-frame realism rules: named light source/signs of life/no repetition, without the flaw words A/B testing rejected", () => {
    expect(UGC_FIRST_FRAME_RULES).toContain("all four elements");
    expect(UGC_FIRST_FRAME_RULES).toContain("one imperfection");
    expect(UGC_FIRST_FRAME_RULES).toMatch(/room/i);
    expect(UGC_FIRST_FRAME_RULES).not.toContain("pores");
    expect(UGC_FIRST_FRAME_RULES).not.toContain("eye bags");
  });

  it("presenterPromptBlock carries both rule sets → applies automatically to drama/interview/talking_head styles", () => {
    for (const s of ["drama", "interview", "talking_head"] as const) {
      expect(stylePrompts[s], s).toContain("Spoken-line realism");
      expect(stylePrompts[s], s).toContain("First-frame realism");
    }
  });
});
