import { describe, it, expect } from "vitest";

describe("TTS expressiveness (emotion passthrough + [pause] breaths)", () => {
  it("stripPauseMarks: removes markers and collapses double spaces", async () => {
    const { stripPauseMarks, hasPauseMarks } = await import("@/lib/voice-markup");
    expect(stripPauseMarks("really, [pause]try it")).toBe("really, try it");
    expect(stripPauseMarks("really [pause] try it")).toBe("really try it");
    expect(stripPauseMarks("[PAUSE]peels at the start too")).toBe("peels at the start too");
    expect(stripPauseMarks("no markers")).toBe("no markers");
    expect(hasPauseMarks("has[pause]markers")).toBe(true);
    expect(hasPauseMarks("none")).toBe(false);
  });

  it("EMOTION_TTS: all six emotions map to the official provider enum", async () => {
    const { EMOTION_TTS } = await import("@/lib/emotion-acting");
    const official = new Set(["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"]);
    for (const v of Object.values(EMOTION_TTS)) {
      expect(official.has(v.emotion)).toBe(true);
      expect(v.instruction.length).toBeGreaterThan(0);
    }
  });

  it("shotEmotion: covers all six shot types; unknown types are undefined", async () => {
    const { shotEmotion } = await import("@/lib/emotion-acting");
    for (const t of ["hook", "pain_point", "product_reveal", "demo", "social_proof", "cta"]) {
      expect(shotEmotion(t)).toBeTruthy();
    }
    expect(shotEmotion("nope")).toBeUndefined();
  });
});
