import { describe, it, expect } from "vitest";
import { shotsToCues, formatSrtTime, formatVttTime, buildSrt, buildVtt, shotsToSrt } from "@/lib/subtitle-export";

const shots = [
  { duration: 3, voiceover: "First sentence" },
  { duration: 2, voiceover: "" }, // blank: occupies 2s on the timeline but produces no cue
  { duration: 4, voiceover: "Third sentence" },
];

describe("shotsToCues", () => {
  it("accumulates by duration, skips empty voiceovers but still advances the timeline", () => {
    const cues = shotsToCues(shots);
    expect(cues.length).toBe(2);
    expect(cues[0]).toMatchObject({ index: 1, startMs: 0, endMs: 3000, text: "First sentence" });
    // third sentence starts at 3000 + 2000 (blank placeholder) = 5000
    expect(cues[1]).toMatchObject({ index: 2, startMs: 5000, endMs: 9000, text: "Third sentence" });
  });
  it("zero duration with copy → gets a minimum visible duration", () => {
    const cues = shotsToCues([{ duration: 0, voiceover: "x" }]);
    expect(cues[0].endMs - cues[0].startMs).toBeGreaterThanOrEqual(500);
  });
  it("short shots (<500ms) do not overlap: cues respect the real duration without stretching", () => {
    const cues = shotsToCues([
      { duration: 0.2, voiceover: "a" },
      { duration: 0.2, voiceover: "b" },
      { duration: 0.2, voiceover: "c" },
    ]);
    expect(cues.map((c) => [c.startMs, c.endMs])).toEqual([
      [0, 200],
      [200, 400],
      [400, 600],
    ]);
    // assert no overlap between consecutive pairs
    for (let i = 1; i < cues.length; i++) expect(cues[i - 1].endMs).toBeLessThanOrEqual(cues[i].startMs);
  });
  it("all empty → empty array", () => {
    expect(shotsToCues([{ duration: 3, voiceover: "  " }])).toEqual([]);
  });
});

describe("timestamp format", () => {
  it("SRT uses a comma, VTT a dot, HH:MM:SS,mmm", () => {
    expect(formatSrtTime(3661500)).toBe("01:01:01,500");
    expect(formatVttTime(3661500)).toBe("01:01:01.500");
    expect(formatSrtTime(0)).toBe("00:00:00,000");
  });
});

describe("buildSrt / buildVtt", () => {
  it("SRT: index + timeline + text", () => {
    const srt = shotsToSrt(shots);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:03,000\nFirst sentence");
    expect(srt).toContain("2\n00:00:05,000 --> 00:00:09,000\nThird sentence");
  });
  it("VTT: with the WEBVTT header", () => {
    const vtt = buildVtt(shotsToCues(shots));
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:00:03.000");
  });
  it("empty cues → SRT empty string / VTT header only", () => {
    expect(buildSrt([])).toBe("");
    expect(buildVtt([])).toBe("WEBVTT\n\n");
  });
});
