import { describe, it, expect } from "vitest";
import { buildCharacterSheetPrompt } from "@/lib/character-sheet";

/**
 * Multi-view sheet prompt contract (v0.8.85): one 2x2 generation = one identical
 * person from four angles. The sheet then anchors identity in the grid/film passes.
 */

describe("multi-view character sheet prompt", () => {
  it("English sheet prompt with no other language mixed in", () => {
    const p = buildCharacterSheetPrompt("woman in her 30s, loose low ponytail, light loungewear");
    expect(p).toContain("2x2 four-view character reference sheet");
    expect(p).toContain("front shoulders-up close-up");
    expect(p).toContain("exactly identical in all four cells");
    expect(p).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
