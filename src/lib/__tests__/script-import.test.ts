import { describe, it, expect } from "vitest";
import { splitNarration, estimateDurationSec, splitNarrationIntoShots } from "@/lib/script-import";

describe("splitNarration", () => {
  it("splits sentences at end punctuation and trims whitespace", () => {
    expect(splitNarration("First sentence. Second sentence!\n Third sentence?")).toEqual(["First sentence", "Second sentence", "Third sentence"]);
  });
  it("overlong sentences split further at secondary punctuation", () => {
    const long = Array.from({ length: 8 }, (_, i) => `this is clause ${i} a fairly long clause used to test splitting`).join(", ") + ".";
    const pieces = splitNarration(long);
    expect(pieces.length).toBeGreaterThan(1);
  });
  it("no segment exceeds the per-shot cap (joining commas count toward length)", () => {
    const long = Array.from({ length: 20 }, () => "ten-word clause content here ok").join(", ") + ".";
    for (const p of splitNarration(long)) {
      expect(Array.from(p).length).toBeLessThanOrEqual(100);
    }
  });
  it("blank → empty array", () => {
    expect(splitNarration("  \n  ")).toEqual([]);
  });
});

describe("estimateDurationSec", () => {
  it("about 14 characters/second, clamped to 2–15s", () => {
    expect(estimateDurationSec("a")).toBe(2); // lower bound
    expect(estimateDurationSec("a".repeat(140))).toBe(10); // 140/14
    expect(estimateDurationSec("a".repeat(300))).toBe(15); // 300/14≈21 → upper bound 15
  });
});

describe("splitNarrationIntoShots", () => {
  it("first=hook, last=cta, middle=demo, with duration/voiceover/description/visualSource", () => {
    const shots = splitNarrationIntoShots("Opening line. Middle content. Closing call.");
    expect(shots.map((s) => s.type)).toEqual(["hook", "demo", "cta"]);
    expect(shots[0].voiceover).toBe("Opening line");
    expect(shots[0].description).toBe("Opening line");
    expect(shots[0].visualSource).toBe("ai_generate");
    expect(shots.every((s) => s.duration >= 2)).toBe(true);
  });
  it("a single sentence → a single shot (i===0 prefers hook)", () => {
    const shots = splitNarrationIntoShots("only one sentence");
    expect(shots.length).toBe(1);
    expect(shots[0].type).toBe("hook");
  });
});
