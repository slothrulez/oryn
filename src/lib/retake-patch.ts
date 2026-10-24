/**
 * Retake patch — single-variable diagnosis-driven resubmission for failed takes.
 *
 * Why: when a generated clip is bad, regenerating with a hand-tweaked prompt
 * usually changes THREE things at once, so nobody learns what fixed it (or the
 * fix regresses something else). The discipline encoded here: diagnose ONE
 * symptom, apply ONE targeted prompt patch, resubmit, compare. The UI states
 * exactly what changed, and only the user pulls the (billed) trigger — this is
 * an explicit new task, never an automatic retry.
 *
 * Patch clauses reuse the project's proven wording (REAL_FACE lineage: state
 * descriptions, no flaw-stacking, no directive negatives beyond what the
 * fidelity constraints already use).
 *
 * Pure functions, no I/O.
 */

export type RetakeSymptom =
  | "face_broken"
  | "skin_waxy"
  | "background_dead"
  | "light_wrong"
  | "blurry"
  | "product_warped";

/** Symptom catalog for the diagnosis picker (bilingual data, rendered by locale). */
export const RETAKE_SYMPTOMS: { id: RetakeSymptom; label: { en: string } }[] = [
  { id: "face_broken", label: { en: "Broken face" } },
  { id: "skin_waxy", label: { en: "Waxy skin" } },
  { id: "background_dead", label: { en: "Dead background" } },
  { id: "light_wrong", label: { en: "Wrong lighting" } },
  { id: "blurry", label: { en: "Blurry footage" } },
  { id: "product_warped", label: { en: "Warped product" } },
];

/**
 * One targeted clause per symptom. Each patch touches exactly ONE dimension of
 * the prompt; blurry additionally slows the camera (motion speed IS the blur
 * variable). Wording follows the field-tested lexicon in motion-prompt/presenters.
 */
const PATCHES: Record<RetakeSymptom, { clause: { en: string }; change: { en: string } }> = {
  face_broken: {
    clause: {
      en: "the person's features stay well-proportioned and symmetrical, facial structure stable without morphing; keep person details simple, framed at medium-close range",
    },
    change: { en: "added only the face-stability constraint and simplified person details" },
  },
  skin_waxy: {
    clause: {
      en: "skin keeps pores and natural texture, matte not shiny, no beauty smoothing, no plastic sheen",
    },
    change: { en: "added only the real-skin-texture constraint" },
  },
  background_dead: {
    clause: {
      en: "one background element keeps its own motion going (curtains swaying / steam rising / a blurred figure passing)",
    },
    change: { en: "added only one living-background element" },
  },
  light_wrong: {
    clause: {
      en: "lighting: one natural source, window light from the side with soft falloff, the frame's single highlight lands on the subject, no studio-lit look",
    },
    change: { en: "changed only the lighting (named source direction + single highlight)" },
  },
  blurry: {
    clause: {
      en: "slow the camera: movement stays slow and steady. subject razor sharp, no smearing, no ghosting",
    },
    change: { en: "only slowed the camera and pinned sharpness" },
  },
  product_warped: {
    clause: {
      en: "the product's appearance, packaging, logo and printed text stay exactly unchanged, contours sharp and undistorted, the product itself never deforms",
    },
    change: { en: "only strengthened the product-fidelity constraint" },
  },
};

export interface RetakePatchResult {
  prompt: string;
  /** Human-readable "this retake changed only X" note */
  change: { en: string };
  /** false when the clause was already present (patch is idempotent) */
  applied: boolean;
}

/**
 * Apply one symptom's patch onto the previously submitted prompt. Idempotent:
 * a prompt already carrying the clause comes back unchanged with applied=false
 * (resubmitting the identical prompt won't fix anything — the caller should say so).
 */
export function applyRetakePatch(originalPrompt: string, symptom: RetakeSymptom): RetakePatchResult {
  const lang = "en" as const;
  const patch = PATCHES[symptom];
  const clause = patch.clause[lang];
  if (originalPrompt.includes(clause)) {
    return { prompt: originalPrompt, change: patch.change, applied: false };
  }
  const sep = ". ";
  const base = originalPrompt.trim().replace(/[\u3002.]\s*$/, "");
  return { prompt: `${base}${sep}${clause}${"."}`, change: patch.change, applied: true };
}
