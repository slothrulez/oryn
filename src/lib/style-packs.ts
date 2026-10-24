/**
 * Style packs — shareable, declarative "recipe" files for compose settings.
 *
 * The 2026 agent-skill wave made packaged video know-how (caption looks, pacing,
 * BGM choices) the community currency; this is Oryn's novice-safe take on
 * "installing an external skill": a pack is pure JSON data — no code, no shell,
 * nothing executable — validated against a whitelist before anything is applied.
 *
 * Packs only carry compose-stage preferences today (caption preset, BGM mood,
 * ducking, quality, aspect ratio, CTA, product card). Unknown fields are ignored
 * for forward compatibility; invalid values are dropped field-by-field rather
 * than failing the whole pack.
 */

import { CAPTION_PRESET_IDS, type CaptionPresetId } from "@/lib/caption-presets";

export const STYLE_PACK_FORMAT = "oryn-style-pack@1";

/** compose-stage preferences a pack may carry (all optional; whitelisted values only) */
export interface StylePackCompose {
  captionPreset?: CaptionPresetId;
  /** BGM mood, or "none" to turn BGM off */
  bgm?: "none" | "upbeat" | "chill" | "energetic" | "emotional";
  /** BGM gain, 0.05..0.4; values outside the range are clamped on import. */
  bgmVolume?: number;
  bgmDuck?: boolean;
  quality?: "fast" | "standard" | "hd";
  aspectRatio?: "9:16" | "16:9" | "1:1";
  ctaText?: string;
  productCard?: boolean;
}

export interface StylePack {
  format: typeof STYLE_PACK_FORMAT;
  /** display name, required, ≤60 chars */
  name: string;
  description?: string;
  author?: string;
  compose: StylePackCompose;
}

const BGM_VALUES = ["none", "upbeat", "chill", "energetic", "emotional"] as const;
const QUALITY_VALUES = ["fast", "standard", "hd"] as const;
const ASPECT_VALUES = ["9:16", "16:9", "1:1"] as const;

function pickEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

/**
 * Parse and validate a pack from untrusted JSON text (an imported file).
 * Returns null when the input isn't a pack at all (bad JSON / wrong format tag / no usable name);
 * otherwise returns a pack whose fields are individually sanitised.
 */
export function parseStylePack(jsonText: string): StylePack | null {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.format !== STYLE_PACK_FORMAT) return null;
  if (typeof o.name !== "string" || !o.name.trim()) return null;

  const c = (typeof o.compose === "object" && o.compose !== null ? o.compose : {}) as Record<string, unknown>;
  const compose: StylePackCompose = {};
  const caption = pickEnum(c.captionPreset, CAPTION_PRESET_IDS);
  if (caption) compose.captionPreset = caption;
  const bgm = pickEnum(c.bgm, BGM_VALUES);
  if (bgm) compose.bgm = bgm;
  if (typeof c.bgmVolume === "number" && Number.isFinite(c.bgmVolume)) {
    compose.bgmVolume = Math.round(Math.min(0.4, Math.max(0.05, c.bgmVolume)) * 100) / 100;
  }
  if (typeof c.bgmDuck === "boolean") compose.bgmDuck = c.bgmDuck;
  const quality = pickEnum(c.quality, QUALITY_VALUES);
  if (quality) compose.quality = quality;
  const aspect = pickEnum(c.aspectRatio, ASPECT_VALUES);
  if (aspect) compose.aspectRatio = aspect;
  if (typeof c.ctaText === "string" && c.ctaText.trim()) compose.ctaText = c.ctaText.trim().slice(0, 60);
  if (typeof c.productCard === "boolean") compose.productCard = c.productCard;

  return {
    format: STYLE_PACK_FORMAT,
    name: o.name.trim().slice(0, 60),
    ...(typeof o.description === "string" && o.description.trim() ? { description: o.description.trim().slice(0, 200) } : {}),
    ...(typeof o.author === "string" && o.author.trim() ? { author: o.author.trim().slice(0, 60) } : {}),
    compose,
  };
}

/** Serialise current settings as a shareable pack file (pretty-printed for hand-editing). */
export function serializeStylePack(pack: Omit<StylePack, "format">): string {
  return JSON.stringify({ format: STYLE_PACK_FORMAT, ...pack }, null, 2);
}

/**
 * Built-in packs: distilled from the category templates that drive Oryn's
 * commerce scripts, so new users get proven combinations instead of a blank slate.
 * name/description are inline English strings (packs are data, not i18n keys).
 */
export const BUILTIN_STYLE_PACKS: StylePack[] = [
  {
    format: STYLE_PACK_FORMAT,
    name: "Commerce Punch",
    description: "Bold captions, upbeat ducked BGM and a product card — fast-paced, high-conversion commerce",
    author: "Oryn",
    compose: { captionPreset: "bold", bgm: "upbeat", bgmDuck: true, productCard: true, quality: "standard" },
  },
  {
    format: STYLE_PACK_FORMAT,
    name: "Karaoke Viral",
    description: "Per-word karaoke captions with energetic ducked BGM — the 2026 viral retention style",
    author: "Oryn",
    compose: { captionPreset: "karaoke", bgm: "energetic", bgmDuck: true, quality: "standard" },
  },
  {
    format: STYLE_PACK_FORMAT,
    name: "Clean Documentary",
    description: "Minimal captions and chill BGM for clean lifestyle/documentary content",
    author: "Oryn",
    compose: { captionPreset: "minimal", bgm: "chill", bgmDuck: false, quality: "hd" },
  },
  {
    format: STYLE_PACK_FORMAT,
    name: "Standard",
    description: "Default boxed captions and category-matched music — the safe default look for any topic",
    author: "Oryn",
    compose: { captionPreset: "standard", bgm: "upbeat", quality: "standard" },
  },
];
