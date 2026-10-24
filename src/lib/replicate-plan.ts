/**
 * Viral-replication planning: parse a reference commerce video, keep its pacing,
 * camera, and framing, then substitute the user's product through ordinal media references.
 *
 * Two replication tiers share this module:
 *  - RHYTHM tier (free, any LLM): scene-cut times from the reference video become a
 *    shot-duration skeleton, injected into script generation as referenceStructure —
 *    the generated script matches the reference's shot count and pacing.
 *  - MODEL tier (Veo 3.1 reference-to-video): the reference video (≤15s) plus
 *    product images go straight into one multimodal generation call; the prompt uses
 *    the official "video 1 / image 1" ordinal references.
 *
 * Pure functions, no I/O — the analyze route feeds in cut times from detectSceneTimes.
 */

export interface ReplicateShot {
  /** 1-based shot index */
  index: number;
  /** Segment start time in seconds */
  start: number;
  /** Segment duration in seconds (0.1s precision) */
  duration: number;
}

/** Segments shorter than this get merged into their predecessor (flash frames, cut jitter). */
const MIN_SHOT_SEC = 1.0;
/** Skeleton cap — scripts beyond ~12 shots degrade (Veo docs: >10 shots turn chaotic). */
const MAX_SHOTS = 12;
/** Veo 3.1 reference_videos hard limit: total reference duration ≤ 15s. */
export const REPLICATE_MAX_REF_SEC = 15;

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Turn detected scene-cut timestamps into a shot skeleton:
 * segments = [0, ...cuts, total]; sub-second fragments merge into the previous
 * segment; when over MAX_SHOTS, the shortest segment repeatedly merges into its
 * shorter neighbor until capped. Returns [] when the duration is unusable.
 */
export function shotPlanFromCuts(
  cuts: number[],
  totalDuration: number,
  opts?: { minShotSec?: number; maxShots?: number },
): ReplicateShot[] {
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) return [];
  const minSec = opts?.minShotSec ?? MIN_SHOT_SEC;
  const maxShots = Math.max(1, opts?.maxShots ?? MAX_SHOTS);

  // clean cut times: inside (0, total), deduped, ascending
  const inner = [...new Set(cuts.filter((t) => Number.isFinite(t) && t > 0 && t < totalDuration))].sort((a, b) => a - b);
  const bounds = [0, ...inner, totalDuration];
  let durations: number[] = [];
  for (let i = 1; i < bounds.length; i++) durations.push(bounds[i] - bounds[i - 1]);

  // merge sub-minimum fragments into the previous segment (the first merges forward)
  const merged: number[] = [];
  for (const d of durations) {
    if (d < minSec && merged.length > 0) merged[merged.length - 1] += d;
    else merged.push(d);
  }
  if (merged.length > 1 && merged[0] < minSec) {
    merged[1] += merged[0];
    merged.shift();
  }
  durations = merged;

  // cap the shot count: repeatedly merge the shortest segment into its shorter neighbor
  while (durations.length > maxShots) {
    let idx = 0;
    for (let i = 1; i < durations.length; i++) if (durations[i] < durations[idx]) idx = i;
    if (idx === 0) {
      durations[1] += durations[0];
      durations.splice(0, 1);
    } else if (idx === durations.length - 1 || durations[idx - 1] <= durations[idx + 1]) {
      durations[idx - 1] += durations[idx];
      durations.splice(idx, 1);
    } else {
      durations[idx + 1] += durations[idx];
      durations.splice(idx, 1);
    }
  }

  let start = 0;
  return durations.map((d, i) => {
    const shot: ReplicateShot = { index: i + 1, start: round1(start), duration: round1(d) };
    start += d;
    return shot;
  });
}

/**
 * The rhythm skeleton as a referenceStructure block for script generation
 * (injected under the existing reference-structure prompt header), in English
 * like the rest of the commerce script prompt.
 */
export function replicateReferenceStructure(shots: ReplicateShot[], totalDuration: number): string {
  if (shots.length === 0) return "";
  const beats = shots.map((s) => `shot ${s.index} ${s.duration}s`).join(", ");
  return [
    `The rhythm skeleton below comes from the real shot cuts of a reference viral video (${shots.length} shots, about ${round1(totalDuration)}s total): ${beats}.`,
    `Generate the same number of shots, with each shot's duration matching the durations above one-to-one (±1s adjustments allowed), and follow the reference pacing: short shots get tight, punchy visuals and copy; long shots carry demos or emotional build-up.`,
    `Do not copy the reference content — replicate only the rhythm and structure.`,
  ].join("\n");
}

/**
 * Prompt for the model-tier one-shot replication (Veo reference-to-video):
 * ordinal references per the official syntax — video 1 = the reference clip,
 * image 1..N = product photos. Product fidelity wording mirrors PRODUCT_CONSTRAINT.
 */
export function buildReplicatePrompt(input: { productName: string; sellingPoints?: string; imageCount: number }): string {
  const parts = [
    `Use video 1 as the reference for camera moves, pacing, shot sizes and transitions, and recreate a product short video in the same style`,
    input.imageCount > 0
      ? `Replace the product in the frame with "${input.productName}" from image 1${input.imageCount > 1 ? `-${input.imageCount}` : ""}; the product's look, packaging, colors, logo and text must match the reference images exactly, with no distortion`
      : `The product is "${input.productName}"`,
  ];
  const points = input.sellingPoints?.trim();
  if (points) parts.push(`Selling points: ${points.slice(0, 100)}`);
  parts.push("No spoken voice; natural ambient sound and action SFX matching the visuals");
  return parts.join(". ") + ".";
}

/**
 * Map a configured video model to its reference-to-video sibling. Families with a
 * reference variant on Atlas: Veo 3.1. Returns undefined when the model family can't replicate — the UI
 * disables the model-tier button with a hint.
 */
const REFERENCE_FAMILY_PATTERN =
  /^google\/veo3\.1\//;

export function referenceModelFor(modelId: string | undefined): string | undefined {
  if (!modelId) return undefined;
  const family = modelId.match(REFERENCE_FAMILY_PATTERN)?.[1];
  if (!family) return undefined;
  if (modelId === `${family}/reference-to-video`) return modelId;
  if (/\/(?:text|image)-to-video$/.test(modelId)) return `${family}/reference-to-video`;
  return undefined;
}
