/**
 * Visual "look" presets with structured lighting and palette options instead of
 * free text, including relight and commerce-composite workflows.
 *
 * Why this exists: the project had NO global visual-style setting — keyframe image
 * prompts relied entirely on whatever style words the script LLM improvised, so shots
 * within one video could drift between looks. A single global look keeps keyframes
 * consistent AND anchors lighting through the i2v pass (i2v models drift lighting when
 * unspecified).
 *
 * Two prompt surfaces per preset:
 *  - `image`: appended to the keyframe generation prompt (rich: light + palette + backdrop).
 *  - `motion`: short lighting anchor for the i2v motion prompt (concise: motion prompts
 *    must stay camera-led; a long style block would dilute the movement instruction).
 *
 * Pure data + pure functions, no I/O. Names/prompts are bilingual data, not i18n keys
 * (same convention as camera-presets.ts / BUILTIN_STYLE_PACKS).
 */

export interface LookPreset {
  id: string;
  /** Display name (picker label) */
  name: { en: string };
  /** Appended to the keyframe image-generation prompt */
  image: { en: string };
  /** Short lighting anchor appended to the i2v motion prompt */
  motion: { en: string };
  /**
   * Preset family: "styled" (default) = art-directed looks; "real" = raw phone-shot looks
   * (the 2026 anti-"AI slop" survey: a camera-identity phrase at the very FRONT of a video
   * prompt biases the model toward handheld-phone distribution far more than mid-prompt
   * quality words — see `opener`).
   */
  group?: "styled" | "real";
  /**
   * Camera-identity opener PREPENDED to the i2v motion prompt (front tokens carry the most
   * weight). Only "real" looks define it; styled looks keep the appended anchor alone.
   */
  opener?: { en: string };
}

/** Sentinel meaning "no global look" (the LLM's own per-shot style words stand alone). */
export const LOOK_NONE = "none";

export const LOOK_PRESETS: LookPreset[] = [
  {
    id: "daylight_clean",
    name: { en: "Clean Daylight" },
    image: {
      en: "bright natural window daylight (~5600K daylight white balance), airy and clean, light minimal backdrop, f/4 moderate depth of field",
    },
    motion: {
      en: "keep bright clean natural daylight throughout",
    },
  },
  {
    id: "warm_life",
    name: { en: "Warm Lifestyle" },
    image: {
      en: "warm afternoon sunlight tones (~3000K warm light), golden light spill, cozy home atmosphere, soft shadows, shallow f/2.0 depth of field",
    },
    motion: {
      en: "keep the warm golden afternoon light throughout",
    },
  },
  {
    id: "studio_product",
    name: { en: "Studio Product" },
    image: {
      en: "professional studio lighting (~5000K key light), crisp rim light on the subject, dark gradient backdrop, f/8 deep focus, sharp premium product texture",
    },
    motion: {
      en: "keep the studio lighting and dark backdrop throughout",
    },
  },
  {
    id: "night_neon",
    name: { en: "Night Neon" },
    image: {
      en: "night city neon mood (~3200K tungsten mixed with neon), warm-cool light contrast, wide-open f/1.8 shallow bokeh backdrop, strong atmosphere",
    },
    motion: {
      en: "keep the neon night bokeh mood throughout",
    },
  },
  {
    id: "premium_gray",
    name: { en: "Premium Gray" },
    image: {
      en: "desaturated premium gray palette (~4500K soft light), diffused lighting, minimalist composition, f/5.6 steady depth, restrained high-end feel",
    },
    motion: {
      en: "keep the desaturated gray palette and soft diffused light throughout",
    },
  },
  {
    id: "forest_soft",
    name: { en: "Soft Botanical" },
    image: {
      en: "natural greenery setting, soft misty morning light (~5000K), f/2.8 shallow depth, fresh soothing palette",
    },
    motion: {
      en: "keep the soft morning light and fresh green palette throughout",
    },
  },
  {
    id: "food_appetizing",
    name: { en: "Appetizing Warm" },
    image: {
      en: "warm appetizing light (~3500K), rich saturated food colors, f/2.8 shallow depth of field, glossy details",
    },
    motion: {
      en: "keep the warm appetizing light and rich colors throughout",
    },
  },
  {
    id: "tech_cool",
    name: { en: "Tech Cool" },
    image: {
      en: "cool-toned tech lighting (~7000K cool tone), blue-violet rim light, dark clean backdrop, f/5.6 steady depth, futuristic feel",
    },
    motion: {
      en: "keep the cool tech lighting throughout",
    },
  },
  // ---- "real" family (2026-08): raw phone-shot looks for the UGC don't-look-AI path.
  // All wording stays positive ("what the image IS") — visual negatives are placebos on
  // video models, and flaw-stacking is banned by the two-round real-face A/B lesson.
  {
    id: "phone_raw",
    name: { en: "Phone Raw" },
    group: "real",
    opener: {
      en: "UGC creator, handheld phone footage",
    },
    image: {
      en: "raw ungraded phone-camera look, natural colors with mixed color temperature and a slight white-balance drift, mild compression feel, casual slightly off-center framing",
    },
    motion: {
      en: "keep the ungraded natural colors and mixed color temperature throughout",
    },
  },
  {
    id: "selfie_front",
    name: { en: "Front-cam Selfie" },
    group: "real",
    opener: {
      en: "Handheld arm's-length selfie on the phone front camera, the holding arm visible in frame",
    },
    image: {
      en: "front phone-camera selfie view, 26mm-equivalent wide angle with close-range edge distortion, the holding arm visible in frame, camera slightly below eye level, everyday background",
    },
    motion: {
      en: "keep the front-camera wide-angle perspective and natural indoor light throughout",
    },
  },
  {
    id: "propped_static",
    name: { en: "Propped Static" },
    group: "real",
    opener: {
      en: "Vertical phone video propped on a counter, static with small surface vibrations",
    },
    image: {
      en: "fixed viewpoint of a phone propped on a counter, slightly low and tilted up, lived-in background, natural indoor light",
    },
    motion: {
      en: "keep the fixed propped viewpoint and natural indoor light throughout",
    },
  },
  {
    id: "dashcam_ride",
    name: { en: "Dashcam" },
    group: "real",
    opener: {
      en: "Dashcam footage from a fixed wide-angle mount",
    },
    image: {
      en: "dashcam quality: ultra-wide with edge distortion, exposure auto-jumping with ambient light, washed colors with hard contrast, slight smearing at the frame edges",
    },
    motion: {
      en: "keep the dashcam wide-angle distortion and auto-exposure jumps throughout",
    },
  },
  {
    id: "old_dv",
    name: { en: "Old DV Tape" },
    group: "real",
    opener: {
      en: "Home video footage shot on an old consumer DV camcorder",
    },
    image: {
      en: "old DV tape look: warm yellow color cast, faint scanlines and grain, focus occasionally hunting, highlights slightly blooming, corner overlay texture without any readable text",
    },
    motion: {
      en: "keep the DV warm cast, grain and focus breathing throughout",
    },
  },
  {
    id: "cctv_store",
    name: { en: "Store CCTV" },
    group: "real",
    opener: {
      en: "Store CCTV footage from a fixed high-angle ceiling camera",
    },
    image: {
      en: "CCTV quality: high-angle top-down view, cold teal cast, low-bitrate compression noise, mild corner vignetting, people mid-activity, moving naturally through the frame",
    },
    motion: {
      en: "keep the fixed CCTV high angle and cold low-bitrate texture throughout",
    },
  },
];

/** Lookup by preset id; "none"/unknown → undefined (no look applied). */
export function getLookPreset(id: string | undefined): LookPreset | undefined {
  if (!id || id === LOOK_NONE) return undefined;
  return LOOK_PRESETS.find((p) => p.id === id);
}

/** The English image-prompt suffix for a look; undefined when no look is selected. */
export function lookImageSuffix(id: string | undefined): string | undefined {
  const preset = getLookPreset(id);
  if (!preset) return undefined;
  return preset.image.en;
}
