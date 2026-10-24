import { describe, it, expect } from "vitest";
import { wrapCaption, chunkCaption } from "@/lib/video-composer/composer";

// width estimation consistent with component: CJK≈fontSize, Latin≈fontSize×0.55; max frameWidth×0.86
const fits = (line: string, fontSize: number, frameWidth: number) => {
  const w = Array.from(line).reduce(
    (s, c) => s + (/[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/.test(c) ? fontSize : fontSize * 0.55),
    0
  );
  return w <= frameWidth * 0.86 + 0.01;
};

describe("wrapCaption (automatic subtitle wrapping)", () => {
  it("long English wraps into multiple lines, none over-wide", () => {
    const text = "Still using tissues that tear at one wipe in your living room today";
    const out = wrapCaption(text, 36, 720);
    expect(out).toContain("\n"); // actually wrapped
    for (const line of out.split("\n")) expect(fits(line, 36, 720)).toBe(true);
    // no characters lost (word order unchanged after removing newlines)
    expect(out.replace(/\n/g, " ")).toBe(text);
  });

  it("Latin breaks at word boundaries without splitting words", () => {
    const out = wrapCaption("hello wonderful beautiful morning sunshine coffee", 40, 480);
    for (const line of out.split("\n")) {
      // each line is a complete word combination (no split words)
      expect(line.trim().split(" ").every((w) => w.length > 0)).toBe(true);
    }
  });

  it("short copy does not wrap", () => {
    expect(wrapCaption("Hello world", 36, 720)).toBe("Hello world");
    expect(wrapCaption("Hi there", 36, 720)).toBe("Hi there");
  });

  it("long text without spaces breaks per character without overflowing", () => {
    const text = "this is a very very very very very very very very long subtitle line used to test that automatic wrapping works";
    const out = wrapCaption(text, 48, 720);
    expect(out).toContain("\n");
    for (const line of out.split("\n")) expect(fits(line, 48, 720)).toBe(true);
    expect(out.replace(/\n/g, " ")).toBe(text);
  });

  it("empty string returns empty string", () => {
    expect(wrapCaption("", 36, 720)).toBe("");
    expect(wrapCaption("   ", 36, 720)).toBe("");
  });
});

describe("chunkCaption (rapid short caption cards)", () => {
  it("short copy/short duration → a single chunk (the whole sentence in one card)", () => {
    expect(chunkCaption("Hi", 0, 1)).toEqual([{ text: "Hi", startTime: 0, endTime: 1 }]);
    expect(chunkCaption("Hi there", 0, 1).length).toBe(1);
  });

  it("empty string → empty array", () => {
    expect(chunkCaption("", 0, 3)).toEqual([]);
    expect(chunkCaption("   ", 0, 3)).toEqual([]);
  });

  it("long text splits into ordered, non-overlapping chunks: first starts at start, last ends at end, together they restore the original", () => {
    const txt = "morning waves gently lap the soft sand";
    const out = chunkCaption(txt, 0, 6);
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].startTime).toBe(0);
    expect(out[out.length - 1].endTime).toBe(6);
    // ordered, non-overlapping
    for (let i = 1; i < out.length; i++) expect(out[i].startTime).toBeCloseTo(out[i - 1].endTime, 3);
    // rejoined text equals original (text without spaces)
    expect(out.map((c) => c.text).join(" ")).toBe(txt);
  });

  it("English splits by word (never splits words)", () => {
    const out = chunkCaption("the quick brown fox jumps over the lazy dog now", 0, 6);
    expect(out.length).toBeGreaterThan(1);
    expect(out.map((c) => c.text).join(" ")).toBe("the quick brown fox jumps over the lazy dog now");
  });

  it("chunk count grows with duration (longer shots get more chunks), capped at 8", () => {
    const txt = "one two three four five six seven eight nine ten ".repeat(3).trim();
    expect(chunkCaption(txt, 0, 2).length).toBeLessThan(chunkCaption(txt, 0, 10).length);
    expect(chunkCaption(txt, 0, 60).length).toBeLessThanOrEqual(8);
  });

  // issue #14 regression: caption cards must cut at punctuation, never mid-phrase
  it("punctuated copy splits at punctuation: never mid-phrase, no dropped characters, no punctuation at a chunk start (issue #14)", () => {
    const txt =
      "Pepsi, double the chill! Full fizz and a crisp kick, one sip cools you right down; classic cola flavor goes with dinner, skewers and hot pot, the more you drink the better; stock a case for parties, binge nights, gaming and barbecues, grab a can anytime, open happiness now!";
    const out = chunkCaption(txt, 0, 20);
    expect(out.length).toBeGreaterThan(1);
    expect(out.length).toBeLessThanOrEqual(8);
    // no characters lost or reordered
    expect(out.map((c) => c.text).join(" ")).toBe(txt);
    // every card boundary sits on punctuation: non-final cards end with a mark, no card starts with one
    const punct = /[!?;,.:]/;
    for (let i = 0; i < out.length; i++) {
      const chars = Array.from(out[i].text);
      expect(punct.test(chars[0])).toBe(false);
      if (i < out.length - 1) expect(punct.test(chars[chars.length - 1])).toBe(true);
    }
    // ordered, non-overlapping, exact endpoints
    expect(out[0].startTime).toBe(0);
    expect(out[out.length - 1].endTime).toBe(20);
    for (let i = 1; i < out.length; i++) expect(out[i].startTime).toBeCloseTo(out[i - 1].endTime, 3);
  });

  it("decimal points are not split (9.9 is not cut into 9/.9)", () => {
    const out = chunkCaption("now only $9.90, limited flash sale!", 0, 4);
    expect(out.map((c) => c.text).join(" ")).toBe("now only $9.90, limited flash sale!");
    expect(out.some((c) => c.text.includes("9.9"))).toBe(true);
  });

  it("when time is too short chunks merge until readable (each card ≥0.6s)", () => {
    const txt = "stock a case first, binge nights, gaming, grab a can, open happiness!";
    const out = chunkCaption(txt, 0, 1.5);
    // 1.5s window → at most 2 cards
    expect(out.length).toBeLessThanOrEqual(2);
    expect(out.map((c) => c.text).join(" ")).toBe(txt);
  });

  it("fragmentary short phrases (wow! etc.) merge into neighboring cards instead of flashing alone", () => {
    const out = chunkCaption("wow! this tastes amazing, buying again for sure!", 0, 6);
    for (const c of out) expect(Array.from(c.text).length).toBeGreaterThanOrEqual(3);
    expect(out.map((c) => c.text).join(" ")).toBe("wow! this tastes amazing, buying again for sure!");
  });
});

describe("thousands-separator price protection + line-start punctuation rules (common in commerce copy)", () => {
  it("chunkCaption: the thousands comma in $1,299 does not split a card", async () => {
    const { chunkCaption } = await import("@/lib/video-composer/composer");
    const cards = chunkCaption("was $1,299, today only $399, gone fast", 0, 6);
    expect(cards.some((c) => c.text.startsWith("299"))).toBe(false);
    expect(cards.length).toBeGreaterThan(1);
    expect(cards.some((c) => c.text.includes("1,299"))).toBe(true);
  });

  it("chunkCaption: the colon in the time 3:45 does not split a card", async () => {
    const { chunkCaption } = await import("@/lib/video-composer/composer");
    const cards = chunkCaption("sale starts at 3:45 pm, first come first served", 0, 4);
    expect(cards.some((c) => c.text.includes("3:45"))).toBe(true);
    expect(cards.some((c) => c.text.startsWith("45"))).toBe(false);
  });

  it("wrapCaption: when the break lands before closing punctuation, the punctuation is pulled back onto the previous line", async () => {
    const { wrapCaption } = await import("@/lib/video-composer/composer");
    const wrapped = wrapCaption("one two three four five six seven eight, nine ten", 46, 460 / 0.86);
    for (const line of wrapped.split("\n")) {
      expect(/^[!?;,.:]/.test(line)).toBe(false);
    }
    expect(wrapped).toContain(",");
  });
});
