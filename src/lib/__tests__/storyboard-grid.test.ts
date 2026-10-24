import { describe, it, expect } from "vitest";
import { buildStoryboardGridPrompt, computeGridCells, GRID_MAX_SHOTS } from "@/lib/storyboard-grid";
import type { Shot, ScriptCharacter } from "@/lib/db/schema";

const shot = (shotId: number, type: string, description: string) =>
  ({ shotId, type, duration: 3, description, voiceover: "line", visualSource: "ai_generate", transition: "cut" }) as unknown as Shot;

describe("buildStoryboardGridPrompt", () => {
  const shots = [shot(1, "hook", "woman looks surprised at the camera"), shot(2, "demo", "tries the product hands-on"), shot(3, "cta", "holds up the product to recommend it")];
  const cast: ScriptCharacter[] = [
    { id: "char_a", name: "Mia", gender: "female", persona: "lively", appearance: "22, high ponytail, white T-shirt" } as ScriptCharacter,
  ];

  it("global consistency block + character setup + per-cell lines + realism rules + no-text hard constraint", () => {
    const p = buildStoryboardGridPrompt(shots, cast);
    expect(p).toContain("same person, same hair and outfit, same room");
    expect(p).toContain("Mia: 22, high ponytail, white T-shirt");
    expect(p).toContain("Cell 1 (hook shot): woman looks surprised at the camera");
    expect(p).toContain("Cell 3 (CTA shot): holds up the product to recommend it");
    expect(p).toContain("influencer"); // REAL_FACE still applies
    expect(p).toContain("all four elements"); // UGC first-frame rules ride along
    expect(p).toContain("no text, captions"); // cells become keyframes after cropping; text would poison them
  });

  it("more than 9 shots truncate to 9 cells; no character setup line without characters", () => {
    const many = Array.from({ length: 12 }, (_, i) => shot(i + 1, "demo", `shot ${i + 1}`));
    const p = buildStoryboardGridPrompt(many);
    expect(p).toContain(`Cell ${GRID_MAX_SHOTS} (`);
    expect(p).not.toContain("Cell 10 (");
    expect(p).not.toContain("Cast:");
  });

  it("reference image convention: character sheet + product images numbered in order; with only product images the product is image 1", () => {
    const both = buildStoryboardGridPrompt(shots, cast, { characterSheet: true, productImage: true });
    expect(both).toContain("Reference image 1 is the presenter's four-view reference sheet");
    expect(both).toContain("Reference image 2 is the real product photo");
    const productOnly = buildStoryboardGridPrompt(shots, cast, { productImage: true });
    expect(productOnly).toContain("Reference image 1 is the real product photo");
    expect(productOnly).not.toContain("reference sheet");
    const none = buildStoryboardGridPrompt(shots, cast);
    expect(none).not.toContain("Reference image");
  });
});

describe("computeGridCells", () => {
  it("9-cell row-major equal split + inset geometry is correct", () => {
    const cells = computeGridCells(900, 1600, { insetRatio: 0 });
    expect(cells.length).toBe(9);
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 300, h: 533 });
    expect(cells[1].x).toBe(300); // row-major: cell 2 is to the right
    expect(cells[3].y).toBe(533); // cell 4 starts row 2
    expect(cells[8]).toEqual({ x: 600, y: 1067, w: 300, h: 533 });
  });

  it("a 9:16 full image gives 9:16 cells too (portrait keyframes need no second crop)", () => {
    const [cell] = computeGridCells(1080, 1920, { insetRatio: 0 });
    expect(cell.w / cell.h).toBeCloseTo(9 / 16, 2);
  });

  it("default 2% inset crops off leftover seams between cells", () => {
    const cells = computeGridCells(900, 1600);
    expect(cells[0].x).toBeGreaterThan(0);
    expect(cells[0].w).toBeLessThan(300);
    // symmetric inset: cell width = original width - 2*inset
    expect(cells[0].w).toBe(300 - 2 * Math.round(300 * 0.02));
  });
});
