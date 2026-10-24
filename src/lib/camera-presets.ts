/**
 * Named camera-move preset library for commerce short-video shots.
 *
 * Why this exists: `Shot.camera` is LLM free text and used to be read-only end-to-end.
 * Curated named moves remove prompt guessing and give every shot a known-good,
 * conflict-free instruction.
 * The library serves three consumers:
 *  1. Script LLM: `cameraPresetGuide()` injects a per-shot-type vocabulary into the
 *     output-format prompt (the old spec was one vague line — the top quality bottleneck).
 *  2. Assets page UI: a per-shot preset picker writes a preset sentence into `Shot.camera`.
 *  3. Motion prompt: the chosen sentence flows through `buildMotionPrompt` unchanged.
 *
 * Every preset sentence MUST pass `hasCameraConflict` (unit-enforced): a hold+move combo
 * needs an explicit sequencing marker, otherwise video models produce jerky indecisive motion.
 *
 * Pure data + pure functions, no I/O. Preset names/prompts are bilingual data, not i18n
 * keys (same convention as BUILTIN_STYLE_PACKS / PRESENTER_PRESETS).
 */
import type { Shot } from "@/lib/db/schema";
import { hasCameraConflict } from "@/lib/motion-prompt";

export type CameraPresetCategory =
  | "push_pull"
  | "orbit"
  | "pan_track"
  | "crane"
  | "handheld"
  | "special";

/** UI group labels for the picker (bilingual data, rendered by locale). */
export const CAMERA_PRESET_CATEGORIES: Record<CameraPresetCategory, { en: string }> = {
  push_pull: { en: "Push / Pull" },
  orbit: { en: "Orbit" },
  pan_track: { en: "Pan / Track" },
  crane: { en: "Crane" },
  handheld: { en: "Handheld" },
  special: { en: "Special" },
};

export interface CameraPreset {
  id: string;
  /** Display name (picker card label) */
  name: { en: string };
  category: CameraPresetCategory;
  /** The exact camera sentence written into `Shot.camera` / the motion prompt */
  prompt: { en: string };
  /** Shot types where this move works best — drives LLM guidance + the picker's "recommended" group */
  goodFor: Array<Shot["type"]>;
}

export const CAMERA_PRESETS: CameraPreset[] = [
  // ---- push / pull ----
  {
    id: "crash_push",
    name: { en: "Crash Push-In" },
    category: "push_pull",
    prompt: {
      en: "camera crashes in fast on the subject, high impact, attention-grabbing opening",
    },
    goodFor: ["hook"],
  },
  {
    id: "slow_push",
    name: { en: "Slow Push-In" },
    category: "push_pull",
    prompt: {
      en: "camera pushes in slowly and steadily, gradually focusing on details",
    },
    goodFor: ["pain_point", "demo", "cta"],
  },
  {
    id: "pull_reveal",
    name: { en: "Pull-Back Reveal" },
    category: "push_pull",
    prompt: {
      en: "camera pulls back slowly, gradually revealing the full scene and subject",
    },
    goodFor: ["social_proof", "cta"],
  },
  {
    id: "dolly_zoom",
    name: { en: "Dolly Zoom" },
    category: "push_pull",
    prompt: {
      en: "dolly zoom: camera moves in while the background compresses away, subject size stays constant, strong spatial tension",
    },
    goodFor: ["hook"],
  },
  // ---- orbit ----
  {
    id: "orbit_slow",
    name: { en: "Slow Orbit" },
    category: "orbit",
    prompt: {
      en: "camera orbits the subject in a slow half circle, highlights sweeping across its surface, strong dimensionality",
    },
    goodFor: ["product_reveal"],
  },
  {
    id: "lazy_susan",
    name: { en: "Turntable" },
    category: "orbit",
    prompt: {
      en: "camera stays locked while the product slowly rotates as if on a turntable, light gliding across its surface",
    },
    goodFor: ["product_reveal"],
  },
  {
    id: "arc_quarter",
    name: { en: "Arc Move" },
    category: "orbit",
    prompt: {
      en: "camera arcs a quarter circle around the subject with natural background parallax",
    },
    goodFor: ["product_reveal", "social_proof"],
  },
  // ---- pan / track ----
  {
    id: "lateral_track",
    name: { en: "Lateral Track" },
    category: "pan_track",
    prompt: {
      en: "camera tracks laterally across the scene, revealing its layers",
    },
    goodFor: ["social_proof"],
  },
  {
    id: "follow_track",
    name: { en: "Follow Track" },
    category: "pan_track",
    prompt: {
      en: "camera smoothly follows the subject's movement, keeping it centered",
    },
    goodFor: ["demo", "pain_point"],
  },
  {
    id: "whip_pan",
    name: { en: "Whip Pan" },
    category: "pan_track",
    prompt: {
      en: "camera whips around onto the subject, high-energy, snappy pacing",
    },
    goodFor: ["hook"],
  },
  // ---- crane ----
  {
    id: "crane_up",
    name: { en: "Crane Up" },
    category: "crane",
    prompt: {
      en: "camera cranes up from low, tilting slightly down on the subject as the scene opens up",
    },
    goodFor: ["social_proof"],
  },
  {
    id: "crane_down_close",
    name: { en: "Crane Down" },
    category: "crane",
    prompt: {
      en: "camera cranes down from above, closing in on the subject into a tight shot",
    },
    goodFor: ["product_reveal"],
  },
  {
    id: "overhead_top",
    name: { en: "Top-Down" },
    category: "crane",
    prompt: {
      en: "top-down overhead shot descending slowly toward the subject, clean tabletop composition",
    },
    goodFor: ["demo"],
  },
  // ---- handheld ----
  {
    id: "handheld_real",
    name: { en: "Handheld" },
    category: "handheld",
    prompt: {
      en: "subtle handheld sway, breathing-like natural movement, authentic vlog feel",
    },
    goodFor: ["pain_point", "social_proof"],
  },
  {
    id: "pov_walk",
    name: { en: "POV Walk" },
    category: "handheld",
    prompt: {
      en: "first-person POV walking toward the subject, natural slight sway, immersive",
    },
    goodFor: ["hook", "demo"],
  },
  // ---- special ----
  {
    id: "macro_glide",
    name: { en: "Macro Glide" },
    category: "special",
    prompt: {
      en: "macro close-up gliding slowly along the product surface, material details razor sharp",
    },
    goodFor: ["product_reveal"],
  },
  {
    id: "hero_rise",
    name: { en: "Hero Shot" },
    category: "special",
    prompt: {
      en: "low-angle hero shot, camera pushing in slowly, commanding presence",
    },
    goodFor: ["product_reveal", "cta"],
  },
  {
    id: "push_then_hold",
    name: { en: "Push Then Hold" },
    category: "special",
    prompt: {
      en: "camera pushes in slowly at first, then settles into a stable held frame to close",
    },
    goodFor: ["cta"],
  },
  {
    id: "locked_on",
    name: { en: "Locked-On" },
    category: "special",
    prompt: {
      en: "LOCKED-ON SHOT: camera rigidly mounted to the subject, subject pinned in frame while the background streams past",
    },
    goodFor: ["demo", "product_reveal"],
  },
  {
    id: "fpv_dive",
    name: { en: "FPV Dive" },
    category: "special",
    prompt: {
      en: "FPV drone dive swooping fast toward the subject, fluid path with real speed",
    },
    goodFor: ["hook"],
  },
  {
    id: "body_orbit",
    name: { en: "Close Orbit Walk" },
    category: "handheld",
    prompt: {
      en: "handheld camera walks a slow half-circle close around the person, natural breathing sway, background parallax flowing",
    },
    goodFor: ["social_proof", "pain_point"],
  },
  {
    id: "focus_shift",
    name: { en: "Rack Focus" },
    category: "special",
    prompt: {
      en: "camera holds position while focus racks from foreground to the subject, depth guiding the eye",
    },
    goodFor: ["demo", "pain_point"],
  },
];

/** Lookup by preset id (undefined for unknown ids). */
export function getCameraPreset(id: string): CameraPreset | undefined {
  return CAMERA_PRESETS.find((p) => p.id === id);
}

/** The preset sentence (sampleText is kept for call-site compatibility). */
export function cameraPresetPrompt(preset: CameraPreset, _sampleText?: string): string {
  return preset.prompt.en;
}

/**
 * Presets recommended for a shot type (goodFor match), preserving library order.
 * Every shot type is covered (unit-enforced); unknown types return an empty list.
 */
export function recommendedPresets(shotType: string): CameraPreset[] {
  return CAMERA_PRESETS.filter((p) => (p.goodFor as string[]).includes(shotType));
}

/**
 * The preset whose sentence exactly equals the given camera text, if any.
 * Lets the UI detect "a preset is currently applied" — the gate for offering a Mix overlay.
 */
export function findPresetByPrompt(cameraText: string | undefined): CameraPreset | undefined {
  const text = cameraText?.trim();
  if (!text) return undefined;
  return CAMERA_PRESETS.find((p) => p.prompt.en === text);
}

/**
 * Two-move overlay: join two preset sentences into one combined
 * instruction ("A, while B"). Returns null when the combination would trip
 * the camera-conflict lint (e.g. a locked-off move over a moving one) — the UI only
 * offers combinations this function accepts. Two moves max by design: once mixed, the
 * text no longer equals any single preset, so the overlay entry point disappears.
 */
export function mixCameraPrompt(a: CameraPreset, b: CameraPreset, _sampleText?: string): string | null {
  if (a.id === b.id) return null;
  const combined = `${a.prompt.en}, while ${b.prompt.en}`;
  return hasCameraConflict(combined) ? null : combined;
}

/** Presets that can overlay onto the given base preset (conflict-lint-safe combinations only). */
export function mixablePresets(base: CameraPreset, sampleText: string): CameraPreset[] {
  return CAMERA_PRESETS.filter((p) => mixCameraPrompt(base, p, sampleText) !== null);
}

/**
 * Shot-type intent labels for the LLM vocabulary block (script-facing prompt).
 * framing = shot size + equivalent focal length (the scale at which this beat's key
 * information MUST be readable); mood = the emotional register the move should carry.
 */
const GUIDE_INTENT_LABELS: Array<{ type: Shot["type"]; label: string; framing: string; mood: string }> = [
  { type: "hook", label: "Opening hook", framing: "extreme close-up to close-up (85-135mm equivalent)", mood: "urgent, gripping" },
  { type: "pain_point", label: "Pain point", framing: "close to medium shot (35-50mm equivalent)", mood: "relatable frustration" },
  { type: "product_reveal", label: "Product reveal", framing: "close-up to medium close-up (85mm equivalent)", mood: "surprised focus" },
  { type: "demo", label: "Demo", framing: "medium shot cutting to close-up (50mm equivalent)", mood: "focused, credible" },
  { type: "social_proof", label: "Social proof", framing: "wide to medium shot (35mm equivalent)", mood: "relaxed everyday" },
  { type: "cta", label: "Closing CTA", framing: "locked close-up (85mm equivalent)", mood: "confident close" },
];

/** Max preset examples per shot type in the LLM guide (keeps the prompt block compact). */
const GUIDE_MAX_PER_TYPE = 3;

/**
 * Camera vocabulary block for the script LLM's output-format prompt. Replaces the old
 * one-line vague spec ("camera movement description") — the single biggest upstream lever on motion
 * quality: the LLM picks from known-good, conflict-free commerce moves instead of
 * improvising, while staying free to fine-tune wording per scene.
 */
export function cameraPresetGuide(): string {
  const lines = GUIDE_INTENT_LABELS.map(({ type, label, framing, mood }) => {
    const examples = recommendedPresets(type)
      .slice(0, GUIDE_MAX_PER_TYPE)
      .map((p) => p.prompt.en)
      .join(" | ");
    return `  · ${label} (${framing}, mood: ${mood}): ${examples}`;
  });
  return [
    "English camera movement description. Prefer the line from the commerce camera vocabulary below that best fits the shot's mood (wording may be adjusted to the scene); keep a single clear direction of movement per shot; never put \"locked-off\" and \"orbit/push/pull\" in the same sentence unless sequenced with \"first... then...\":",
    ...lines,
  ].join("\n");
}
