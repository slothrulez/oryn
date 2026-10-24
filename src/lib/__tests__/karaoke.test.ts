import { describe, it, expect } from "vitest";
import { toAssTime, assEscapeText, splitKaraokeUnits, buildKaraokeAss } from "@/lib/video-composer/karaoke";

describe("toAssTime", () => {
  it("seconds → H:MM:SS.cc", () => {
    expect(toAssTime(0)).toBe("0:00:00.00");
    expect(toAssTime(1.5)).toBe("0:00:01.50");
    expect(toAssTime(65.25)).toBe("0:01:05.25");
  });
  it("negatives clamp to 0", () => {
    expect(toAssTime(-3)).toBe("0:00:00.00");
  });
  it("centisecond carry crosses seconds/minutes/hours correctly (no longer truncates to .99)", () => {
    expect(toAssTime(2.999)).toBe("0:00:03.00");
    expect(toAssTime(59.996)).toBe("0:01:00.00");
    expect(toAssTime(3599.996)).toBe("1:00:00.00");
    expect(toAssTime(2.994)).toBe("0:00:02.99");
  });
});

describe("assEscapeText", () => {
  it("escapes { } \\ and newlines", () => {
    expect(assEscapeText("a{b}c")).toBe("a\\{b\\}c");
    expect(assEscapeText("x\\y")).toBe("x\\\\y");
    expect(assEscapeText("line 1\nline 2")).toBe("line 1\\Nline 2");
  });
});

describe("splitKaraokeUnits", () => {
  it("numbers split as their own units", () => {
    expect(splitKaraokeUnits("save 50% now")).toEqual(["save ", "50% ", "now"]);
  });
  it("Latin splits by word (spaces join the word end)", () => {
    expect(splitKaraokeUnits("buy it now")).toEqual(["buy ", "it ", "now"]);
  });
  it("empty string → empty array", () => {
    expect(splitKaraokeUnits("")).toEqual([]);
    expect(splitKaraokeUnits("   ")).toEqual([]);
  });
});

describe("buildKaraokeAss", () => {
  const lines = [{ text: "save 50% now no-brainer", startTime: 0, endTime: 3 }];

  it("contains the ASS header/styles/per-word \\k events", () => {
    const ass = buildKaraokeAss(lines);
    expect(ass).toContain("[Script Info]");
    expect(ass).toContain("[V4+ Styles]");
    expect(ass).toContain("Style: K,");
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:03.00,K,");
    expect(ass).toContain("{\\k"); // per-character karaoke tag
    expect(ass).toContain("save");
  });

  it("the \\k values in a line sum to the line duration (centiseconds)", () => {
    const ass = buildKaraokeAss([{ text: "save 50% now no-brainer", startTime: 0, endTime: 3 }]);
    const dialogue = ass.split("\n").find((l) => l.startsWith("Dialogue:"))!;
    const ks = [...dialogue.matchAll(/\\k(\d+)/g)].map((m) => Number(m[1]));
    expect(ks.length).toBe(4); // 4 words
    expect(ks.reduce((a, b) => a + b, 0)).toBe(300); // 3s = 300cs
  });

  it("custom styles take effect", () => {
    const ass = buildKaraokeAss(lines, { fontName: "Noto Sans", primaryColour: "&H0000FF00" });
    expect(ass).toContain("Noto Sans");
    expect(ass).toContain("&H0000FF00");
  });

  it("default MarginV uses the safe area (PlayResY 1920 → 326, avoiding the platform bottom UI) and can be overridden explicitly", () => {
    const f = buildKaraokeAss(lines).split("\n").find((l) => l.startsWith("Style: K,"))!.split(",");
    expect(Number(f[f.length - 2])).toBe(326); // safe-zone marginV (old value 240 fell inside the dead zone)
    const f2 = buildKaraokeAss(lines, { marginV: 100 }).split("\n").find((l) => l.startsWith("Style: K,"))!.split(",");
    expect(Number(f2[f2.length - 2])).toBe(100); // explicit override takes precedence
  });

  it("numbers with units are emphasized automatically: larger font + hot color \\1c (prices/discounts stand out)", () => {
    const d = buildKaraokeAss([{ text: "save 50% no-brainer", startTime: 0, endTime: 3 }])
      .split("\n")
      .find((l) => l.startsWith("Dialogue:"))!;
    const fsVals = [...d.matchAll(/\\fs(\d+)/g)].map((m) => Number(m[1]));
    expect(new Set(fsVals).size).toBeGreaterThan(1); // emphasis font size differs from normal font size
    expect(Math.max(...fsVals)).toBeGreaterThan(Math.min(...fsVals)); // numeric units are enlarged
    expect(d).toContain("&H0050FF&"); // orange-red emphasis color is present
  });

  it("emphasizeNumbers:false disables number emphasis", () => {
    const d = buildKaraokeAss([{ text: "Save 50%", startTime: 0, endTime: 2 }], { emphasizeNumbers: false })
      .split("\n")
      .find((l) => l.startsWith("Dialogue:"))!;
    const fsVals = [...d.matchAll(/\\fs(\d+)/g)].map((m) => Number(m[1]));
    expect(new Set(fsVals).size).toBe(1); // all characters use the same font size
    expect(d).not.toContain("&H0050FF&"); // no emphasis color
  });

  it("more units than total centiseconds (very short duration + long voiceover) produces no negative \\k", () => {
    const d = buildKaraokeAss([{ text: "get it now order right away grab it", startTime: 0, endTime: 0.05 }])
      .split("\n")
      .find((l) => l.startsWith("Dialogue:"))!;
    const ks = [...d.matchAll(/\\k(-?\d+)/g)].map((m) => Number(m[1]));
    expect(ks.length).toBeGreaterThan(0);
    expect(ks.every((k) => k >= 1)).toBe(true); // no negative \k values
  });

  it("filters invalid lines (endTime<=startTime / empty text)", () => {
    const ass = buildKaraokeAss([
      { text: "Great find", startTime: 0, endTime: 2 },
      { text: "", startTime: 2, endTime: 4 },
      { text: "bad line", startTime: 5, endTime: 5 },
    ]);
    expect((ass.match(/Dialogue:/g) || []).length).toBe(1);
  });
});

describe("buildKaraokeLineTextFromWords (real word timings drive \\k)", () => {
  const cfg = { baseFs: 46, primaryC: "&H00F0FF&", accentC: "&H0050FF&", emphasize: true, emphScale: 1.35 };

  it("emits \\k from word timings: comma pauses join the previous word, leading silence becomes an empty \\k block", async () => {
    const { buildKaraokeLineTextFromWords } = await import("@/lib/video-composer/karaoke");
    const line = {
      text: "Good morning",
      startTime: 10,
      endTime: 13,
      words: [
        { text: "Good", startSec: 10.5, endSec: 11.1 },
        { text: "morning", startSec: 11.5, endSec: 11.8 },
      ],
    };
    const body = buildKaraokeLineTextFromWords(line, cfg);
    expect(body.startsWith("{\\k50}")).toBe(true);
    expect(body).toContain("\\k100\\");
    expect(body).toContain("\\k30\\");
    const ks = [...body.matchAll(/\\k(\d+)/g)].map((m) => Number(m[1]));
    expect(ks).toEqual([50, 100, 30]);
  });

  it("word text mismatching the line text beyond tolerance → empty string (falls back to estimation, keeps subtitles clean)", async () => {
    const { buildKaraokeLineTextFromWords } = await import("@/lib/video-composer/karaoke");
    const line = {
      text: "this is a completely different very very long line of dialogue",
      startTime: 0,
      endTime: 3,
      words: [{ text: "short", startSec: 0, endSec: 0.3 }],
    };
    expect(buildKaraokeLineTextFromWords(line, cfg)).toBe("");
  });

  it("no words → empty string", async () => {
    const { buildKaraokeLineTextFromWords } = await import("@/lib/video-composer/karaoke");
    expect(buildKaraokeLineTextFromWords({ text: "Hi", startTime: 0, endTime: 2 }, cfg)).toBe("");
  });
});

describe("buildKaraokeAss speechEndTime (the estimation path only covers the speech window, no longer crawling over breath gaps)", () => {
  it("with speechEndTime the total \\k ≈ the speech window rather than the display window", async () => {
    const { buildKaraokeAss } = await import("@/lib/video-composer/karaoke");
    const ass = buildKaraokeAss([{ text: "Hello world", startTime: 0, endTime: 4, speechEndTime: 2 }]);
    const ks = [...ass.matchAll(/\\k(\d+)/g)].map((m) => Number(m[1]));
    const total = ks.reduce((a, b) => a + b, 0);
    expect(total).toBe(200);
  });
});
