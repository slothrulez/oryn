/**
 * Character sheet — multi-view reference generation for the presenter library.
 *
 * Why: a presenter described only in words drifts between generations (new face
 * every batch). One 2x2 turnaround sheet (front / side / back / close-up) rendered
 * in a single generation pins the SAME person from four angles; downstream passes
 * (storyboard grid, one-tap film, per-shot keyframes) attach the sheet as a
 * reference image, so the character stops morphing across shots and across videos.
 *
 * Pure prompt builder only; the route does the I/O.
 */
import { realFaceLine } from "@/lib/presenters";


/**
 * Build the 2x2 multi-view sheet prompt. Hard constraints mirror the storyboard grid's: equal cells,
 * no text/borders (the sheet travels as a reference image), one identical person.
 */
export function buildCharacterSheetPrompt(appearance: string, name?: string): string {
  const who = (name ?? "").trim();
  return [
    `A 2x2 four-view character reference sheet, square 1:1 overall, cells separated only by hairline white gutters.`,
    `All four cells are the SAME person captured at the same moment from four angles — identical face, hair, outfit and posture, on a plain light-gray studio background.`,
    `Character${who ? ` (${who})` : ""}: ${appearance}. Realistic human proportions, head-to-body ratio about 1:7-7.5, never stylized elongated hero proportions.`,
    `Cells: top-left = front full body; top-right = left-side full body; bottom-left = back full body; bottom-right = front shoulders-up close-up (features clearly visible).`,
    realFaceLine(appearance) + ".",
    `Hard rules: strictly equal cells; no text, numbers, watermarks or decorative borders anywhere; the person must be exactly identical in all four cells.`,
  ].join("\n");
}
