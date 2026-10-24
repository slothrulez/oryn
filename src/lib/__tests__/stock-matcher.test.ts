import { describe, it, expect } from "vitest";
import {
  broadenQuery,
  shotQuery,
  scoreCandidate,
  pickBestCandidate,
  authorKeyOf,
  entityTermsOf,
  continuityGroups,
} from "@/lib/stock-matcher";

describe("broadenQuery (there is always a stock fallback)", () => {
  it("multiple words: specific to broad, including the last two words/last word + universal fallback", () => {
    const r = broadenQuery("quantum entanglement physics");
    expect(r[0]).toBe("entanglement physics");
    expect(r[1]).toBe("physics");
    expect(r).toContain("abstract background");
    expect(r).toContain("lifestyle");
    expect(r).toContain("nature");
  });

  it("single word: only the universal fallback remains (without the original word)", () => {
    const r = broadenQuery("coffee");
    expect(r).not.toContain("coffee");
    expect(r).toEqual(["abstract background", "lifestyle", "nature", "light"]);
  });

  it("deduped and excludes terms identical to the original", () => {
    const r = broadenQuery("nature");
    expect(r).not.toContain("nature"); // original word is excluded
    // remaining fallbacks are still present
    expect(r).toContain("lifestyle");
    expect(new Set(r).size).toBe(r.length); // no duplicates
  });

  it("empty string: returns the universal fallback", () => {
    expect(broadenQuery("")).toEqual(["abstract background", "lifestyle", "nature", "light"]);
    expect(broadenQuery("   ")).toEqual(["abstract background", "lifestyle", "nature", "light"]);
  });
});

describe("shotQuery (builds the shot search term)", () => {
  it("prefers stockKeywords (space-joined)", () => {
    expect(shotQuery({ stockKeywords: ["coffee morning", "cafe"], description: "English description" })).toBe("coffee morning cafe");
  });
  it("without stockKeywords falls back to the description, then the voiceover", () => {
    expect(shotQuery({ description: "living room coffee table" })).toBe("living room coffee table");
    expect(shotQuery({ voiceover: "are you still using" })).toBe("are you still using");
    expect(shotQuery({})).toBe("");
  });
});

describe("scoreCandidate / pickBestCandidate (candidate selection)", () => {
  const shot = { stockKeywords: ["tissue", "home", "living room"] };

  it("keyword overlap + portrait scores higher than unrelated + landscape", () => {
    const good = { id: "a", tags: ["tissue", "home"], orientation: "portrait" as const };
    const bad = { id: "b", tags: ["car", "city"], orientation: "landscape" as const };
    expect(scoreCandidate(shot, good)).toBeGreaterThan(scoreCandidate(shot, bad));
  });

  it("pickBestCandidate picks the top score", () => {
    const cands = [
      { id: "a", tags: ["car"], orientation: "landscape" as const },
      { id: "b", tags: ["tissue", "home", "living"], orientation: "portrait" as const },
    ];
    expect(pickBestCandidate(shot, cands)?.id).toBe("b");
  });

  it("already-used candidates get a dedupe penalty", () => {
    const cand = { id: "a", tags: ["tissue"], orientation: "portrait" as const };
    expect(scoreCandidate(shot, cand, { usedIds: new Set(["a"]) })).toBeLessThan(scoreCandidate(shot, cand));
  });

  it("videos get a bonus with preferVideo", () => {
    const img = { id: "a", tags: ["tissue"], type: "image" as const };
    const vid = { id: "b", tags: ["tissue"], type: "video" as const };
    expect(scoreCandidate(shot, vid, { preferVideo: true })).toBeGreaterThan(scoreCandidate(shot, img, { preferVideo: true }));
  });

  it("empty candidates → undefined", () => {
    expect(pickBestCandidate(shot, [])).toBeUndefined();
  });
});

describe("authorKeyOf (same-source author key)", () => {
  it("provider + normalized author name (no spaces/lowercase)", () => {
    expect(authorKeyOf({ source: "pexels", author: " Anna Lee " })).toBe("pexels:anna lee");
    expect(authorKeyOf({ source: "Pixabay", author: "BOB" })).toBe("pixabay:bob");
  });
  it("no author → null, excluded from continuity", () => {
    expect(authorKeyOf({ source: "local", author: "" })).toBeNull();
    expect(authorKeyOf({ source: "pexels" })).toBeNull();
    expect(authorKeyOf({ source: "pexels", author: "   " })).toBeNull();
  });
  it("placeholder author names (Unknown/vendor name) → null: two unattributed assets are not the same source", () => {
    expect(authorKeyOf({ source: "openverse", author: "Unknown" })).toBeNull();
    expect(authorKeyOf({ source: "pexels", author: "Pexels" })).toBeNull();
    expect(authorKeyOf({ source: "pixabay", author: "Pixabay" })).toBeNull();
    expect(authorKeyOf({ source: "nasa", author: "NASA" })).toBeNull();
    expect(authorKeyOf({ source: "archive", author: "Internet Archive" })).toBeNull();
    // real NASA center IS a valid grouping signal (same center = coherent archival footage)
    expect(authorKeyOf({ source: "nasa", author: "NASA / JSC" })).toBe("nasa:nasa / jsc");
    // the user's local material pool genuinely is one source — valid key by design
    expect(authorKeyOf({ source: "local", author: "local asset" })).toBe("local:local asset");
  });
});

describe("entityTermsOf (entity term extraction)", () => {
  it("removes shot/fallback generic words and keeps entity terms", () => {
    const t = entityTermsOf({ stockKeywords: ["tissue paper closeup", "slow motion"] });
    expect(t.has("tissue")).toBe(true);
    expect(t.has("paper")).toBe(true);
    expect(t.has("closeup")).toBe(false);
    expect(t.has("slow")).toBe(false);
    expect(t.has("motion")).toBe(false);
  });
  it("Latin words need ≥3 characters", () => {
    const t = entityTermsOf({ description: "an ox coffee" });
    expect(t.has("an")).toBe(false);
    expect(t.has("ox")).toBe(false);
    expect(t.has("coffee")).toBe(true);
  });
});

describe("continuityGroups (connected groups of shots sharing entities)", () => {
  it("shots sharing entity terms join one group, transitively (A-B share tissue, B-C share paper → one group)", () => {
    const groups = continuityGroups([
      { shotId: 1, stockKeywords: ["tissue home"] },
      { shotId: 2, stockKeywords: ["tissue paper"] },
      { shotId: 3, stockKeywords: ["paper texture"] },
      { shotId: 4, stockKeywords: ["city night"] },
    ]);
    expect(groups).toContainEqual([1, 2, 3]);
    expect(groups).toContainEqual([4]);
  });

  it("sharing only generic shot words (closeup/slow motion) does not form a group", () => {
    const groups = continuityGroups([
      { shotId: 1, stockKeywords: ["coffee closeup slow motion"] },
      { shotId: 2, stockKeywords: ["ocean closeup slow motion"] },
    ]);
    expect(groups).toContainEqual([1]);
    expect(groups).toContainEqual([2]);
  });

  it("groups and members keep input order; single-shot groups are returned too", () => {
    const groups = continuityGroups([
      { shotId: 10, stockKeywords: ["cat"] },
      { shotId: 20, stockKeywords: ["dog"] },
      { shotId: 30, stockKeywords: ["cat playing"] },
    ]);
    expect(groups).toEqual([[10, 30], [20]]);
  });

  it("empty input → empty array", () => {
    expect(continuityGroups([])).toEqual([]);
  });
});

describe("same-source continuity bonus (sameSourceAuthors)", () => {
  const shot = { stockKeywords: ["tissue"] };

  it("candidates from an author already chosen in the group score higher", () => {
    const cand = { id: "a", tags: ["tissue"], source: "pexels", author: "Anna" };
    const base = scoreCandidate(shot, cand);
    const boosted = scoreCandidate(shot, cand, { sameSourceAuthors: new Set(["pexels:anna"]) });
    expect(boosted).toBe(base + 6);
  });

  it("relevance still wins: one more keyword hit (+10) beats the same-source bonus (+6)", () => {
    const relevant = { id: "a", tags: ["tissue", "home"], source: "pexels", author: "Other" };
    const sameAuthor = { id: "b", tags: ["tissue"], source: "pexels", author: "Anna" };
    const opts = { sameSourceAuthors: new Set(["pexels:anna"]) };
    expect(
      pickBestCandidate({ stockKeywords: ["tissue", "home"] }, [relevant, sameAuthor], opts)?.id
    ).toBe("a");
  });

  it("when evenly matched same-source wins; same-asset dedupe (-8) still outweighs same-source (+6)", () => {
    const sameAuthor = { id: "a", tags: ["tissue"], source: "pexels", author: "Anna" };
    const other = { id: "b", tags: ["tissue"], source: "pixabay", author: "Bob" };
    const opts = { sameSourceAuthors: new Set(["pexels:anna"]) };
    expect(pickBestCandidate(shot, [other, sameAuthor], opts)?.id).toBe("a");
    // the same-author candidate was already USED → dedup penalty flips the pick
    expect(pickBestCandidate(shot, [other, sameAuthor], { ...opts, usedIds: new Set(["a"]) })?.id).toBe("b");
  });

  it("an empty set adds no bonus", () => {
    const cand = { id: "a", tags: ["tissue"], source: "pexels", author: "Anna" };
    expect(scoreCandidate(shot, cand, { sameSourceAuthors: new Set() })).toBe(scoreCandidate(shot, cand));
  });
});

describe("broadenQuery subject anchoring + fallbackLevelOf fallback levels", () => {
  it("subjectEn sits between the narrowed terms and the universal fallback (stays on topic before going generic)", async () => {
    const { broadenQuery } = await import("@/lib/stock-matcher");
    const r = broadenQuery("pour over brewing closeup", "coffee");
    const coffeeIdx = r.indexOf("coffee");
    const universalIdx = r.indexOf("abstract background");
    expect(coffeeIdx).toBeGreaterThan(-1);
    expect(coffeeIdx).toBeLessThan(universalIdx);
    expect(r.indexOf("brewing closeup")).toBeLessThan(coffeeIdx);
  });

  it("subjectEn is deduped when it repeats an existing term", async () => {
    const { broadenQuery } = await import("@/lib/stock-matcher");
    const r = broadenQuery("fresh coffee", "coffee");
    expect(r.filter((q) => q === "coffee")).toHaveLength(1);
  });

  it("fallbackLevelOf: original word=original, narrowed/subject=narrowed, universal word=universal", async () => {
    const { fallbackLevelOf } = await import("@/lib/stock-matcher");
    expect(fallbackLevelOf("pour over brewing", "pour over brewing")).toBe("original");
    expect(fallbackLevelOf("pour over brewing", "brewing")).toBe("narrowed");
    expect(fallbackLevelOf("pour over brewing", "coffee")).toBe("narrowed");
    expect(fallbackLevelOf("pour over brewing", "abstract background")).toBe("universal");
    expect(fallbackLevelOf("pour over brewing", "Nature")).toBe("universal");
  });
});

describe("scoreCandidate soft bonus for slot duration (prevents frozen tails)", () => {
  it("candidates at least as long as the slot score higher, but one keyword hit can still overtake", async () => {
    const { scoreCandidate } = await import("@/lib/stock-matcher");
    const shot = { description: "coffee brewing" };
    const longEnough = { type: "video" as const, durationSec: 8 };
    const tooShort = { type: "video" as const, durationSec: 2 };
    expect(scoreCandidate(shot, longEnough, { slotSec: 6 })).toBe(scoreCandidate(shot, tooShort, { slotSec: 6 }) + 3);
    const shortButRelevant = { type: "video" as const, durationSec: 2, tags: ["coffee"] };
    expect(scoreCandidate(shot, shortButRelevant, { slotSec: 6 })).toBeGreaterThan(scoreCandidate(shot, longEnough, { slotSec: 6 }));
  });

  it("unknown durations and images are unaffected", async () => {
    const { scoreCandidate } = await import("@/lib/stock-matcher");
    const shot = { description: "coffee" };
    const unknown = { type: "video" as const };
    const image = { type: "image" as const, durationSec: 99 };
    expect(scoreCandidate(shot, unknown, { slotSec: 6 })).toBe(scoreCandidate(shot, unknown, {}));
    expect(scoreCandidate(shot, image, { slotSec: 6 })).toBe(scoreCandidate(shot, image, {}));
  });
});
