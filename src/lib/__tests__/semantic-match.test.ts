import { describe, it, expect } from "vitest";
import { buildRerankPrompt, parseRerankPicks, type RerankShot } from "@/lib/semantic-match";

const shots: RerankShot[] = [
  {
    shotId: 0,
    text: "step one of pour-over coffee at home",
    candidates: [
      { title: "coffee shop exterior", tags: ["cafe", "street"], source: "openverse" },
      { title: "pour over coffee brewing at home", tags: ["coffee", "kitchen"], source: "pexels" },
    ],
  },
  {
    shotId: 2,
    text: "keep the water at 92 degrees",
    candidates: [
      { title: "kettle thermometer", source: "openverse" },
      { title: "random landscape", source: "openverse" },
      { title: "boiling water close-up", tags: ["water", "steam"], source: "pixabay" },
    ],
  },
];

describe("buildRerankPrompt", () => {
  it("numbers candidates per shot and demands strict JSON picks", () => {
    const p = buildRerankPrompt(shots);
    expect(p).toContain("Shot 0");
    expect(p).toContain("Shot 2");
    expect(p).toContain("0. coffee shop exterior");
    expect(p).toContain("1. pour over coffee brewing at home");
    expect(p).toContain("2. boiling water close-up");
    expect(p).toContain('[{"shotId":shot number,"pick":candidate index or -1}]');
    expect(p).toContain("answer -1");
  });

  it("clips overlong titles/text so the batched prompt stays small", () => {
    const long = buildRerankPrompt([
      { shotId: 0, text: "w".repeat(200), candidates: [{ title: "t".repeat(200) }, { title: "b" }] },
    ]);
    expect(long).toContain("…");
    expect(long).not.toContain("w".repeat(100));
    expect(long).not.toContain("t".repeat(100));
  });
});

describe("parseRerankPicks", () => {
  it("parses plain and fenced JSON replies", () => {
    const plain = parseRerankPicks('[{"shotId":0,"pick":1},{"shotId":2,"pick":2}]', shots);
    expect(plain?.get(0)).toBe(1);
    expect(plain?.get(2)).toBe(2);
    const fenced = parseRerankPicks('```json\n[{"shotId":0,"pick":1}]\n```', shots);
    expect(fenced?.get(0)).toBe(1);
  });

  it("drops invalid entries (unknown shot / out-of-range or non-integer pick) but keeps the valid ones", () => {
    const picks = parseRerankPicks(
      '[{"shotId":0,"pick":1},{"shotId":9,"pick":0},{"shotId":2,"pick":5},{"shotId":2,"pick":0.5},"junk"]',
      shots
    );
    expect(picks?.size).toBe(1);
    expect(picks?.get(0)).toBe(1);
    expect(picks?.has(2)).toBe(false);
  });

  it("returns null when nothing usable parses", () => {
    expect(parseRerankPicks("", shots)).toBeNull();
    expect(parseRerankPicks("sorry I cannot", shots)).toBeNull();
    expect(parseRerankPicks("[]", shots)).toBeNull();
    expect(parseRerankPicks('[{"shotId":9,"pick":0}]', shots)).toBeNull();
    expect(parseRerankPicks("{not json]", shots)).toBeNull();
  });

  it("tolerates prose around the JSON array", () => {
    const picks = parseRerankPicks('Sure, here are my picks: [{"shotId":0,"pick":0}] hope that helps', shots);
    expect(picks?.get(0)).toBe(0);
  });
});
