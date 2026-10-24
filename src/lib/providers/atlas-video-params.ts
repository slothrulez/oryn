/**
 * Per-model video request params for Atlas Cloud (mirrors buildImageSizeParams, issue #18).
 *
 * Atlas video models disagree on how the same intent is expressed:
 * - last frame:  `last_image` vs `end_image`
 * - duration:    integer enums with different ranges (Veo {4,6,8}), or no duration param at all
 * - resolution:  different tier vocabularies ("480p/720p/1080p", "720p/1080p/4k")
 * - aspect:      `ratio` vs `aspect_ratio`, some enums include "adaptive"
 * - audio:       `generate_audio` vs `sound` vs none
 * - references:  paired arrays, one mixed `refers` array, `images` + single `video`, `images` + `videos`
 *
 * Every spec below was transcribed from the model's published input schema
 * (static.atlascloud.ai/model/schema/*.json, fetched 2026-08).
 *
 * Unknown models discovered at runtime get a spec derived from the same published
 * schema via specFromOpenApiInput() — this is what makes new Atlas models usable
 * without a code change.
 */

import type { VideoOptions } from './types'

// ==================== Spec type ====================

/** How a model expects reference materials for reference-to-video generation */
export type ReferenceShape =
  | 'paired-arrays' // reference_images[] + reference_videos[]
  | 'refers' // one mixed refers[] of image/video/audio URLs
  | 'images-plus-video' // images[] + a single video string
  | 'images-videos' // images[] + videos[]

export interface AtlasVideoParamSpec {
  /** Field carrying the first-frame image (present on i2v variants) */
  firstFrameKey?: 'image'
  /** Field carrying the pinned last frame, when the model supports one */
  lastFrameKey?: 'last_image' | 'end_image'
  /** Allowed integer durations in seconds; omit for free-form integer duration */
  durationEnum?: number[]
  /** Model exposes no duration parameter at all */
  noDuration?: boolean
  /** Allowed resolution tier strings, verbatim from the schema */
  resolutionEnum?: string[]
  /** Aspect-ratio field name and its allowed values */
  ratioKey?: 'ratio' | 'aspect_ratio'
  ratioEnum?: string[]
  /** Audio on/off boolean field, when the model exposes one */
  audioKey?: 'generate_audio' | 'sound' | 'audio'
  /** How reference materials are expressed (reference-to-video variants only) */
  referenceShape?: ReferenceShape
  /** Max reference IMAGES the schema accepts (reference-to-video variants); omit = unknown, don't gate */
  maxReferenceImages?: number
  supportsSeed?: boolean
  supportsWatermark?: boolean
  /**
   * Schema-required params with their schema defaults, applied when the caller
   * provided nothing to derive them from (e.g. some models require resolution+duration).
   */
  requiredDefaults?: { resolution?: string; duration?: number }
}

// ==================== Curated specs (transcribed from published schemas) ====================
// Verified against the published schema (2026-09). Native 480p/720p/1080p are separate products
// from the -sr/-esr upscale tiers and are priced differently: an earlier transcription omitted
// native 1080p entirely, so every "1080p" request was resolved to the pricier 1080p-sr (issue #28).

export const ATLAS_VIDEO_PARAM_SPECS: Record<string, AtlasVideoParamSpec> = {
  // (no 1080p), ratio is adaptive-only, and there is no reference-to-video variant, so the
  // one-call film pass cannot use it. Schema verified 2026-09. ---
  // --- Google Veo 3.1 ---
  'google/veo3.1/text-to-video': {
    durationEnum: [4, 6, 8],
    resolutionEnum: ['720p', '1080p', '4k'],
    ratioKey: 'aspect_ratio',
    ratioEnum: ['16:9', '9:16'],
    audioKey: 'generate_audio',
    supportsSeed: true,
  },
  'google/veo3.1/image-to-video': {
    firstFrameKey: 'image',
    lastFrameKey: 'last_image',
    durationEnum: [4, 6, 8],
    resolutionEnum: ['720p', '1080p', '4k'],
    ratioKey: 'aspect_ratio',
    ratioEnum: ['16:9', '9:16'],
    audioKey: 'generate_audio',
    supportsSeed: true,
  },
  // Native 480p/720p/1080p plus -esr upscale tiers; audio costs the same either way. ---
}

/** Curated spec lookup by exact model ID */
export function getVideoParamSpec(modelId: string): AtlasVideoParamSpec | undefined {
  return ATLAS_VIDEO_PARAM_SPECS[modelId]
}

// ==================== Value pickers ====================

/** Nearest allowed duration; ties break toward the shorter (cheaper/faster) option */
export function pickEnumDuration(allowed: number[], want: number): number | undefined {
  const candidates = allowed.filter((v) => Number.isFinite(v) && v > 0)
  if (candidates.length === 0) return undefined
  let best = candidates[0]
  for (const c of candidates) {
    const d = Math.abs(c - want)
    const bd = Math.abs(best - want)
    if (d < bd || (d === bd && c < best)) best = c
  }
  return best
}

/**
 * Parse a resolution tier string into a comparable pixel-height class.
 * Handles "480p" / "768P" / "1080p-SR" (leading digits) and "2K" / "4k" shorthands.
 */
function parseResTier(value: string): number | undefined {
  const lower = value.toLowerCase()
  const p = lower.match(/^(\d+)\s*p/)
  if (p) return Number(p[1])
  // k-shorthands carry suffixes too ("4k-esr"), so match the prefix rather than the whole string
  const k = lower.match(/^(\d+)\s*k/)
  if (!k) return undefined
  const n = Number(k[1])
  return n === 1 ? 1080 : n === 2 ? 1440 : n === 4 ? 2160 : undefined
}

/**
 * Pick the smallest tier that still covers the requested short side (quality-first
 * ceiling; equal-cost per-request pricing means never silently downgrading).
 * Plain tiers win over suffixed variants of the same class (720p over 720p-SR).
 */
export function pickResolution(allowed: string[], width: number, height: number): string | undefined {
  const minSide = Math.min(width, height)
  const parsed = allowed
    .map((v) => ({ v, tier: parseResTier(v) }))
    .filter((e): e is { v: string; tier: number } => e.tier !== undefined)
    .sort((a, b) => a.tier - b.tier || a.v.length - b.v.length)
  if (parsed.length === 0) return undefined
  const covering = parsed.find((e) => e.tier >= minSide)
  return (covering ?? parsed[parsed.length - 1]).v
}

/**
 * Pick the allowed aspect value nearest to width/height. Numeric "a:b" entries are
 * preferred over "adaptive" when dimensions are known (deterministic output framing);
 * an enum that only offers "adaptive" returns it as-is.
 */
export function pickRatio(allowed: string[], width: number, height: number): string | undefined {
  if (allowed.length === 0) return undefined
  const target = width / height
  let best: string | undefined
  let bestDiff = Infinity
  for (const value of allowed) {
    const m = value.match(/^(\d+):(\d+)$/)
    if (!m) continue
    const diff = Math.abs(Number(m[1]) / Number(m[2]) - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = value
    }
  }
  return best ?? (allowed.includes('adaptive') ? 'adaptive' : allowed[0])
}

// ==================== Body builder ====================

/**
 * Build the /model/generateVideo request body for a model with a known param spec.
 * Only fields the model's schema actually declares are emitted, so vendors with
 * strict input validation never see foreign params (the pre-billing failure mode
 * of issue #18, now avoided for video too).
 */
export function buildAtlasVideoBody(
  modelId: string,
  spec: AtlasVideoParamSpec,
  options: VideoOptions,
  prompt: string
): Record<string, unknown> {
  const body: Record<string, unknown> = { model: modelId, prompt }
  const { width, height, duration } = options

  if (options.mode === 'video-to-video' && spec.referenceShape) {
    const images = options.referenceImageUrls ?? []
    const videos = options.referenceVideoUrls ?? []
    const audios = options.referenceAudioUrls ?? []
    switch (spec.referenceShape) {
      case 'refers':
        // `refers` takes one mixed array; keep videos first so ordinal prompt references
        // ("video 1 … image 1…") keep pointing at the reference clip before product photos
        body.refers = [...videos, ...images, ...audios]
        break
      case 'paired-arrays':
        if (images.length) body.reference_images = images
        if (videos.length) body.reference_videos = videos
        if (audios.length) body.reference_audios = audios
        break
      case 'images-plus-video':
        if (images.length) body.images = images
        if (videos.length) body.video = videos[0]
        break
      case 'images-videos':
        if (images.length) body.images = images
        if (videos.length) body.videos = videos
        break
    }
  } else {
    if (spec.firstFrameKey && options.firstFrameUrl) body[spec.firstFrameKey] = options.firstFrameUrl
    if (spec.lastFrameKey && options.lastFrameUrl) body[spec.lastFrameKey] = options.lastFrameUrl
  }

  if (!spec.noDuration) {
    if (duration) {
      body.duration = spec.durationEnum
        ? pickEnumDuration(spec.durationEnum, duration)
        : Math.round(duration)
    } else if (spec.requiredDefaults?.duration !== undefined) {
      body.duration = spec.requiredDefaults.duration
    }
  }

  if (spec.resolutionEnum) {
    const resolution =
      width && height ? pickResolution(spec.resolutionEnum, width, height) : undefined
    const fallback = spec.requiredDefaults?.resolution
    if (resolution) body.resolution = resolution
    else if (fallback) body.resolution = fallback
  }

  if (spec.ratioKey && spec.ratioEnum?.length) {
    const ratio = width && height ? pickRatio(spec.ratioEnum, width, height) : undefined
    if (ratio) body[spec.ratioKey] = ratio
  }

  if (spec.audioKey) body[spec.audioKey] = options.audioEnabled ?? false
  if (spec.supportsSeed && options.seed !== undefined) body.seed = options.seed
  if (spec.supportsWatermark) body.watermark = false

  return { ...body, ...options.extra }
}

// ==================== Runtime spec derivation (dynamic discovery) ====================

interface OpenApiProperty {
  type?: string
  enum?: unknown[]
  default?: unknown
}

interface OpenApiInput {
  properties?: Record<string, OpenApiProperty>
  required?: string[]
}

/**
 * Derive a param spec from a model's published input schema
 * (components.schemas.Input of static.atlascloud.ai/model/schema/<id>.json).
 * Returns undefined when the JSON doesn't look like an input schema, in which
 * case the caller falls back to the legacy request body.
 */
export function specFromOpenApiInput(input: unknown): AtlasVideoParamSpec | undefined {
  const schema = input as OpenApiInput | undefined
  const props = schema?.properties
  if (!props || typeof props !== 'object') return undefined

  const spec: AtlasVideoParamSpec = {}

  if ('image' in props) spec.firstFrameKey = 'image'
  if ('end_image' in props) spec.lastFrameKey = 'end_image'
  else if ('last_image' in props) spec.lastFrameKey = 'last_image'

  const durationProp = props.duration
  if (!durationProp) {
    spec.noDuration = true
  } else if (Array.isArray(durationProp.enum)) {
    const values = durationProp.enum.filter((v): v is number => typeof v === 'number' && v > 0)
    if (values.length) spec.durationEnum = values
  }

  const resolutionEnum = props.resolution?.enum
  if (Array.isArray(resolutionEnum)) {
    spec.resolutionEnum = resolutionEnum.filter((v): v is string => typeof v === 'string')
  }

  const ratioKey = 'ratio' in props ? 'ratio' : 'aspect_ratio' in props ? 'aspect_ratio' : undefined
  if (ratioKey) {
    const ratioEnum = props[ratioKey]?.enum
    if (Array.isArray(ratioEnum)) {
      spec.ratioKey = ratioKey
      spec.ratioEnum = ratioEnum.filter((v): v is string => typeof v === 'string')
    }
  }

  if (props.generate_audio?.type === 'boolean') spec.audioKey = 'generate_audio'
  else if (props.sound?.type === 'boolean') spec.audioKey = 'sound'

  if ('refers' in props) spec.referenceShape = 'refers'
  else if ('reference_images' in props || 'reference_videos' in props) spec.referenceShape = 'paired-arrays'
  else if ('images' in props && 'videos' in props) spec.referenceShape = 'images-videos'
  else if ('images' in props && 'video' in props) spec.referenceShape = 'images-plus-video'

  if ('seed' in props) spec.supportsSeed = true
  if ('watermark' in props) spec.supportsWatermark = true

  const required = Array.isArray(schema?.required) ? schema.required : []
  const requiredDefaults: AtlasVideoParamSpec['requiredDefaults'] = {}
  if (required.includes('resolution') && typeof props.resolution?.default === 'string') {
    requiredDefaults.resolution = props.resolution.default
  }
  if (required.includes('duration') && typeof durationProp?.default === 'number') {
    requiredDefaults.duration = durationProp.default
  }
  if (requiredDefaults.resolution || requiredDefaults.duration !== undefined) {
    spec.requiredDefaults = requiredDefaults
  }

  return spec
}
