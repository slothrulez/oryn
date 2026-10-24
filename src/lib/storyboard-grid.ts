/**
 * 3x3 storyboard grid — single-image consistency anchoring for multi-shot videos.
 *
 * Why: chained keyframes and text appearance anchors fight identity drift shot by
 * shot; a storyboard GRID kills it at the source — one generation renders all
 * shots in one image, so the person, outfit, room and light are physically the
 * same pixels-era subject in every cell. Each cell is then cropped out and saved
 * as that shot's keyframe, and the existing i2v pass animates them.
 *
 * Geometry trick: a 3x3 grid at 9:16 overall yields cells that are each exactly
 * 9:16 — the cropped cells drop straight into our vertical pipeline.
 *
 * Pure functions (prompt building + crop geometry); the route does the I/O.
 */
import type { Shot, ScriptCharacter } from "@/lib/db/schema";
import { REAL_FACE_CONSTRAINT, UGC_FIRST_FRAME_RULES } from "@/lib/presenters";

export const GRID_ROWS = 3;
export const GRID_COLS = 3;
export const GRID_MAX_SHOTS = GRID_ROWS * GRID_COLS;

/** Shot-type label used in per-cell prompt lines. */
const SHOT_TYPE_LABELS: Record<string, string> = {
  hook: "hook shot",
  pain_point: "pain-point shot",
  product_reveal: "product shot",
  demo: "demo shot",
  social_proof: "social-proof shot",
  cta: "CTA shot",
};

/**
 * Build the one-shot 3x3 storyboard-grid image prompt: global consistency block
 * (same person / outfit / room / light) + one numbered line per cell + realism
 * rules + hard grid-layout constraints (equal cells, thin gutters, no text —
 * cells get cropped into keyframes, so any text or borders would poison them).
 */
export function buildStoryboardGridPrompt(
  shots: Shot[],
  characters?: ScriptCharacter[] | null,
  refs?: { characterSheet?: boolean; productImage?: boolean }
): string {
  const cells = shots.slice(0, GRID_MAX_SHOTS);
  const cast = (characters ?? [])
    .map((c) => `${c.name}: ${c.appearance}`)
    .filter(Boolean)
    .join("; ");

  const cellLines = cells.map((s, i) => {
    const label = SHOT_TYPE_LABELS[String(s.type)] ?? "shot";
    return `Cell ${i + 1} (${label}): ${s.description}`;
  });

  // reference-image contract: the images array order is [character sheet?, product photo?],
  // so the prompt cites them by position (field-proven with gpt-image-2/edit)
  const refLines: string[] = [];
  if (refs?.characterSheet || refs?.productImage) {
    let n = 0;
    if (refs.characterSheet) {
      n += 1;
      refLines.push(
        `Reference image ${n} is the presenter's four-view reference sheet — the person's face, hair, build and outfit in all nine cells must match it exactly (identity reference only, never a cell frame). Blend the person naturally into each cell's own scene and lighting — never carry the sheet's plain gray studio backdrop, its 2x2 split or borders into any cell.`
      );
    }
    if (refs.productImage) {
      n += 1;
      refLines.push(`Reference image ${n} is the real product photo — the product's look, colors and packaging in all nine cells must match it exactly.`);
    }
  }

  return [
    `One ${GRID_ROWS}x${GRID_COLS} storyboard grid of equal cells, whole image vertical 9:16, with only very thin white gutters between cells.`,
    `Global consistency (most important): the nine cells are storyboard frames of the same video — same person, same hair and outfit, same room, same light direction and color tone; props and product stay identical across cells.`,
    ...refLines,
    cast ? `Cast: ${cast}.` : "",
    `Cell contents (each cell is the frame of one separate shot, composed for vertical 9:16; each cell freezes the instant just before that shot's action begins, with the pose holding the momentum of what is about to happen):`,
    ...cellLines,
    REAL_FACE_CONSTRAINT.en + ".",
    UGC_FIRST_FRAME_RULES,
    `Hard requirements: strictly equal 3x3 cells; no text, captions, numbers, watermarks or decorative borders anywhere; every cell is a complete shot frame usable on its own.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface GridCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Crop rectangles for the grid cells, inset by `insetRatio` of the cell size on
 * every edge — generated grids never have pixel-perfect gutters, so a small
 * inset (default 2%) trims the seam residue instead of keeping it as a border.
 * Row-major order (left→right, top→bottom) matching the prompt's cell numbering.
 */
export function computeGridCells(
  width: number,
  height: number,
  opts: { rows?: number; cols?: number; insetRatio?: number } = {}
): GridCell[] {
  const rows = opts.rows ?? GRID_ROWS;
  const cols = opts.cols ?? GRID_COLS;
  const inset = opts.insetRatio ?? 0.02;
  const cellW = width / cols;
  const cellH = height / rows;
  const dx = cellW * inset;
  const dy = cellH * inset;
  const cells: GridCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        x: Math.round(c * cellW + dx),
        y: Math.round(r * cellH + dy),
        w: Math.round(cellW - 2 * dx),
        h: Math.round(cellH - 2 * dy),
      });
    }
  }
  return cells;
}
