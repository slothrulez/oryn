/**
 * Motion-prompt engine for image-to-video (i2v) generation — the quality lever of the i2v main path.
 *
 * Why this exists: the script engine already writes a per-shot `camera` movement description
 * (push/pull/pan/track language), but the i2v call used to send the shot's STATIC image prompt instead —
 * scene wording with zero motion language, which yields bland or unpredictable movement.
 * i2v models (Veo 3.1 family) take composition/subject from the first frame; the text
 * prompt's job is to direct MOTION: camera path + subject micro-action + stability constraints.
 *
 * Rules encoded here (commerce-specific):
 *  - Camera: prefer the script's own `camera` field; fall back to a per-shot-type default move.
 *  - Subject micro-action per shot type: bring the frame alive WITHOUT re-imagining the scene.
 *  - Product shots get hard fidelity constraints (i2v models notoriously warp printed text/logos).
 *  - Always close with stability/artifact constraints — cheap wins against flicker & morphing.
 *  - English-only output, matching the English scripts.
 *
 * Pure functions, unit-testable, no I/O.
 */
import type { Shot } from "@/lib/db/schema";
import { REAL_FACE_CONSTRAINT } from "@/lib/presenters";
import { emotionActingLine, shotEmotion } from "@/lib/emotion-acting";
import type { ProductCategory } from "@/lib/script-engine/templates";

/** Camera-movement amplitude tier (enumerated enumerated intensity instead of free text). */
export type MotionIntensity = "subtle" | "normal" | "strong";

export interface MotionPromptInput {
  /** Shot type drives the default camera move + subject micro-action */
  shotType?: Shot["type"] | string;
  /** The script engine's camera movement description (e.g. "close-up + slow push-in"); preferred over defaults */
  camera?: string;
  /** Short scene description used as a semantic anchor (truncated; the first frame already fixes the scene) */
  description?: string;
  /** Apply product-fidelity constraints (product visible in frame — logo/text must not warp) */
  productShot?: boolean;
  /**
   * Keyframe-chained generation: the clip's last
   * frame is pinned to the NEXT shot's keyframe, so the shot ends by flowing into the next scene —
   * the transition is generated inside the clip and the composer's hard concat becomes seamless.
   */
  chainToNext?: boolean;
  /** Camera amplitude tier; "normal" (default) keeps the baseline wording unchanged */
  intensity?: MotionIntensity;
  /**
   * A cast character is on camera in this shot: append the anti-"AI face" realism
   * constraint so the model renders an ordinary person, not a polished influencer face.
   */
  personShot?: boolean;
  /**
   * The on-camera character is SPEAKING this shot (has a voiceover line): replace the
   * generic micro-action with talking direction (mouth movement, blinks, one micro-pause)
   * plus two behavior beats. Beats rotate per shot via `beatSeed` — repeating the same
   * gestures across a batch is the biggest AI tell.
   */
  talking?: boolean;
  /** Deterministic seed (e.g. shot index) picking which two behavior beats this shot gets */
  beatSeed?: number;
  /**
   * Global visual-look lighting anchor (see look-presets.ts): a SHORT bilingual line that
   * pins the lighting/palette through the i2v pass — i2v models drift lighting when
   * unspecified, which breaks look consistency across chained shots.
   */
  look?: { en: string };
  /**
   * Camera-identity opener from a "real"-family look preset — PREPENDED as the prompt's
   * first phrase (front tokens weigh most: "UGC creator, handheld phone footage" up front
   * biases the whole generation toward the phone-shot distribution).
   */
  opener?: { en: string };
  /**
   * Project product category (free string from the DB; unknown values are ignored).
   * Unlocks the category physical-realism layers:
   *  - category fidelity constraint (productShot): what "intact" means for THIS material
   *  - physical-interaction phrase (demo/product_reveal): action + material reaction
   *  - both rotate deterministically via beatSeed against batch-level sameness
   */
  category?: string;
  /**
   * Physical-realism layer tier (user-selectable, single choice):
   *  - "auto" (default): all layers — category constraint + interaction phrase +
   *    living background + hair/fabric inertia + emotion process
   *  - "constraints": category fidelity constraint only (no added motion phrases)
   *  - "off": none of the realism layers (legacy prompt shape)
   * Defaults to "auto" so every hands-off chain gets the quality layers without wiring.
   */
  realism?: MotionRealismTier;
}

/** Realism-layer tier for buildMotionPrompt (a user-facing single-select). */
export type MotionRealismTier = "auto" | "constraints" | "off";

/** Per-shot-type default camera move — used only when the script didn't provide one. */
const CAMERA_DEFAULTS: Record<string, { en: string }> = {
  hook: { en: "camera pushes in fast on the subject, punchy opening" },
  pain_point: { en: "slow push-in with a subtle handheld feel" },
  product_reveal: { en: "camera orbits the product slowly, highlights sweeping across its surface" },
  demo: { en: "camera smoothly follows the demonstration, moving in for close-up details" },
  social_proof: { en: "slow lateral tracking shot across the scene" },
  cta: { en: "slow push-in, focusing on the subject" },
};

const CAMERA_FALLBACK = { en: "slow push-in on the subject" };

/** Per-shot-type subject micro-action — animates the still frame without re-imagining the scene. */
const ACTION_DEFAULTS: Record<string, { en: string }> = {
  hook: { en: "the subject moves eye-catchingly with high energy" },
  pain_point: { en: "people and surroundings move subtly and naturally, authentic mood" },
  product_reveal: { en: "the product itself stays still; only light and camera move, emphasizing material texture" },
  demo: { en: "hands demonstrate naturally and continuously" },
  social_proof: { en: "scene elements drift subtly, believable everyday atmosphere" },
  cta: { en: "the subject stays prominent and stable as the frame settles" },
};

const ACTION_FALLBACK = { en: "the scene comes alive naturally with coherent subject motion" };

/**
 * Talking-shot subject direction — replaces the per-type micro-action when the character
 * speaks. Written as visible speech behavior (mouth movement, blinks, one beat of hesitation),
 * NOT lip-sync to specific words: the voice track is TTS overlaid by the composer, so the clip
 * only needs to read as "a person mid-conversation".
 */
const TALKING_ACTION = {
  en: "the person talks naturally to camera: natural mouth movement, blinks and small head motions, one brief mid-sentence pause, eyes drift away once and return",
};

/**
 * Behavior-beat pool for talking shots. Each shot gets two, rotated by beatSeed —
 * identical gestures repeated across a batch read as AI immediately.
 */
const BEHAVIOR_BEATS: { en: string }[] = [
  { en: "glances off to the side mid-sentence" },
  { en: "leans back briefly, then settles forward again" },
  { en: "gives a small shrug" },
  { en: "switches the object to the other hand" },
  { en: "gets briefly distracted by something off-screen" },
  { en: "breaks into a half-smile at their own words" },
];

/** Pick two distinct behavior beats deterministically from the seed (adjacent picks avoid repeats). */
export function pickBehaviorBeats(seed: number, lang: "en"): string[] {
  const n = BEHAVIOR_BEATS.length;
  const i = ((Math.floor(seed) % n) + n) % n;
  const j = (i + 1 + (((Math.floor(seed / n) % (n - 1)) + (n - 1)) % (n - 1))) % n;
  return [BEHAVIOR_BEATS[i][lang], BEHAVIOR_BEATS[j][lang]];
}

/** Product-fidelity constraint (printed text & logos are the first thing i2v models destroy). */
const PRODUCT_CONSTRAINT = {
  en: "the product's appearance, packaging, colors, logo and printed text must remain exactly unchanged, text stays sharp and undistorted",
};

/**
 * Category-specific fidelity constraints — what "intact" physically means for THIS
 * material class. The generic PRODUCT_CONSTRAINT protects print/logo; these protect the
 * failure mode each category actually exhibits (cream clumping, food crumbling, fabric
 * stiffening, glare on metal). Positive-phrased state descriptions, not negative lists.
 */
const CATEGORY_CONSTRAINTS: Record<ProductCategory, { en: string }> = {
  beauty: {
    en: "cream and liquid textures stay smooth and even, spreading naturally without clumping",
  },
  food: {
    en: "food keeps vivid natural color and clear texture, holding its shape without collapsing or crumbling",
  },
  home: {
    en: "parts open and close smoothly and precisely, seams and structure stay aligned and stable",
  },
  fashion: {
    en: "fabric drapes naturally with soft believable creases, the fit stays relaxed, never stiff",
  },
  tech: {
    en: "metal and screen reflections stay clean and restrained, seams aligned, on-screen content sharp and stable",
  },
};

/**
 * Physical-interaction phrase pool: "action + material reaction" pairs per category.
 * A demo shot that shows the material RESPONDING (spring-back, crumbs, ripple, glide)
 * reads as real footage; an action with no material feedback reads as CG. Rotated by
 * beatSeed — identical interactions across a batch are an instant AI tell.
 */
const PHYSICAL_ACTION_LEXICON: Record<ProductCategory, { en: string }[]> = {
  beauty: [
    { en: "a fingertip spreads the cream slowly, the texture gliding open and settling onto the skin" },
    { en: "one pump releases a drop that lands and spreads slowly on the back of the hand" },
    { en: "the cap twists off to reveal a smooth untouched surface with a soft sheen" },
  ],
  food: [
    { en: "it snaps open with crisp flakes falling, the cross-section clearly layered" },
    { en: "steam rises gently from the surface while sauce runs slowly down the edge" },
    { en: "it quivers slightly when lifted, plump and springy" },
  ],
  home: [
    { en: "the moving part glides shut cleanly and precisely" },
    { en: "a palm presses the surface, which flexes slightly and springs back" },
    { en: "water runs over the surface, beading and sliding along the texture" },
  ],
  fashion: [
    { en: "the hem swings out on the turn, then settles back naturally" },
    { en: "fingers pinch and release the fabric, the crease easing back open slowly" },
    { en: "the fabric ripples subtly with each step" },
  ],
  tech: [
    { en: "a finger swipes across the screen, the interface responding fluidly" },
    { en: "the earbud drops into the case, snapping gently into place magnetically" },
    { en: "the device rotates as a single highlight sweeps along the metal edge" },
  ],
};

/** Shot types that demonstrate the product physically (get a physical-interaction phrase). */
const PHYSICAL_ACTION_TYPES = new Set(["demo", "product_reveal"]);

/**
 * Living-background pool: ONE named background element with its own ongoing state.
 * AI clips die behind the subject — a frozen backdrop reads as a rendered set. One
 * element is enough; more turns the background busy and steals focus.
 */
const LIVING_BG: { en: string }[] = [
  { en: "curtains in the background sway gently in the airflow" },
  { en: "someone drifts through the blurred background without pulling focus" },
  { en: "a lamp's glow in the background breathes subtly brighter and dimmer" },
  { en: "a hot drink nearby gives off a faint wisp of steam" },
  { en: "the light from the window shifts slowly as clouds pass" },
  { en: "leaves of a background plant tremble now and then" },
];

/** Hair/fabric inertia — secondary motion lag is the cheapest "real physics" signal on a person. */
const FABRIC_HAIR_LAG = {
  en: "when the person moves or turns, hair and fabric lag slightly then settle back naturally",
};

/** Deterministic pool pick shared by the category/background layers (same contract as pickBehaviorBeats). */
function pickFrom<T>(pool: T[], seed: number): T {
  const n = pool.length;
  return pool[((Math.floor(seed) % n) + n) % n];
}

/** Normalize the free-form DB category string to a known category (undefined otherwise). */
function normalizeCategory(category: string | undefined): ProductCategory | undefined {
  return category && category in CATEGORY_CONSTRAINTS ? (category as ProductCategory) : undefined;
}

/** Universal stability/artifact tail — cheap, consistent win against flicker and morphing. */
const QUALITY_TAIL = {
  en: "stable smooth footage, natural lighting transitions, no flicker, no morphing, no new objects appearing",
};

/** Chained-clip guidance: direct the in-clip transition toward the pinned last frame. */
const CHAIN_GUIDANCE = {
  en: "the camera moves naturally into the specified last frame at the end, one continuous fluent transition, no jump cut",
};

/**
 * Continuous-single-take declaration (Veo official guidance: without it the model may cut
 * mid-clip, which breaks per-shot semantics — each of our clips must be exactly one take).
 * Mutually exclusive with CHAIN_GUIDANCE: a chained clip ends by transitioning INTO the next
 * scene, so "no scene changes" would contradict the chain instruction.
 */
const SINGLE_SHOT = {
  en: "one continuous single take throughout, no cuts, no scene changes",
};

/**
 * Sound direction for audio-capable models (Veo 3.1 generates audio; unspecified audio tends
 * toward random speech). Speech always comes from our TTS voice-over — clip audio must stay
 * ambient-only, since the composer surfaces native audio on shots WITHOUT a voice-over track.
 */
const SOUND_DIRECTION = {
  en: "sound: natural ambient and action sound effects matching the scene, no speech, the ambient noise floor stays continuous as one space",
};

/** Camera amplitude wording per intensity tier ("normal" keeps the baseline prompt unchanged). */
const INTENSITY_LINES: Record<Exclude<MotionIntensity, "normal">, { en: string }> = {
  subtle: { en: "camera movement stays subtle and restrained, slow and steady" },
  strong: { en: "bold pronounced camera movement, brisk impactful pacing" },
};

/** Camera-hold keywords (a locked-off camera instruction). */
const STATIC_CAMERA_RE = /\b(fixed|static|locked(-off)?|still|stationary)\b/i;
/** Continuous camera-movement keywords. */
const MOVING_CAMERA_RE =
  /orbit|push[- ]?in|pull[- ]?back|dolly|pan|tilt|track|crane|zoom|whip|follow|swoop/i;
/** Sequencing markers that legitimise combining hold + move (e.g. "push in, then hold"). */
const SEQUENCE_RE = /\b(then|after|before|finally|ending|start|first|next|later)\b/i;

/**
 * Conflict lint for scripted camera text (Veo docs: contradictory instructions like
 * "locked-off shot" + "orbit" in one prompt produce jerky, indecisive motion). A hold + move combo is a
 * conflict ONLY without a sequencing marker — "push in then hold" is valid direction.
 */
export function hasCameraConflict(camera: string): boolean {
  return STATIC_CAMERA_RE.test(camera) && MOVING_CAMERA_RE.test(camera) && !SEQUENCE_RE.test(camera);
}

/** Max chars of the scene description kept as a semantic anchor (the first frame already fixes composition). */
const DESC_ANCHOR_MAX = 60;

/**
 * Build the i2v motion prompt for a shot. The camera line leads (motion is the message),
 * followed by subject action, an optional short scene anchor, fidelity constraints for product
 * shots, and the stability tail. Language follows the script (camera/description text).
 */
export function buildMotionPrompt(input: MotionPromptInput): string {
  const probe = `${input.camera ?? ""}${input.description ?? ""}`;
  const lang = "en" as const;
  const type = String(input.shotType ?? "");

  // Conflict lint: a self-contradictory scripted camera (hold + move, no sequencing) would yield
  // jerky indecisive motion — fall back to the shot type's single known-good instruction instead
  const scripted = input.camera?.trim();
  const camera =
    scripted && !hasCameraConflict(scripted) ? scripted : (CAMERA_DEFAULTS[type] ?? CAMERA_FALLBACK)[lang];
  const seed = input.beatSeed ?? 0;
  const realism: MotionRealismTier = input.realism ?? "auto";
  const category = realism === "off" ? undefined : normalizeCategory(input.category);
  // motion-phrase layers (interaction/background/inertia/emotion) only at the full tier
  const fullRealism = realism === "auto";
  // a speaking character overrides the per-type micro-action: the shot must read as
  // "mid-conversation", with two rotating behavior beats against batch-level repetition
  let action = input.talking
    ? `${TALKING_ACTION[lang]}${"; "}${pickBehaviorBeats(seed, lang).join(", ")}`
    : (ACTION_DEFAULTS[type] ?? ACTION_FALLBACK)[lang];
  // demonstration shots with a known category get one "action + material reaction" phrase:
  // material feedback (spring-back, crumbs, ripple) is what separates footage from CG
  if (fullRealism && category && PHYSICAL_ACTION_TYPES.has(type)) {
    action += `${"; "}${pickFrom(PHYSICAL_ACTION_LEXICON[category], seed)[lang]}`;
  }
  // non-talking person shots get one emotion process phrase (trigger → body-first →
  // restrained face); talking shots already carry their own behavior direction
  const emotion = fullRealism && !input.talking && input.personShot ? shotEmotion(type) : undefined;
  const anchor = (input.description ?? "").trim().slice(0, DESC_ANCHOR_MAX);
  const intensity = input.intensity && input.intensity !== "normal" ? INTENSITY_LINES[input.intensity][lang] : undefined;
  // one living-background element for shots where a frozen backdrop would betray the render
  const livingBg = fullRealism && (input.personShot || type === "demo") ? pickFrom(LIVING_BG, seed)[lang] : undefined;
  const fabricLag = fullRealism && input.personShot;

  const parts: string[] = [];
  if (input.opener) parts.push(input.opener.en);
  parts.push(`Camera: ${camera}`);
  if (intensity) parts.push(intensity);
  parts.push(`Motion: ${action}`);
  if (emotion) parts.push(emotionActingLine(emotion, seed, "en"));
  if (livingBg) parts.push(livingBg);
  if (fabricLag) parts.push(FABRIC_HAIR_LAG.en);
  if (anchor) parts.push(`Scene: ${anchor}`);
  if (input.look) parts.push(`Lighting: ${input.look.en}`);
  parts.push(input.chainToNext ? CHAIN_GUIDANCE.en : SINGLE_SHOT.en);
  if (input.personShot) parts.push(REAL_FACE_CONSTRAINT.en);
  if (input.productShot) parts.push(PRODUCT_CONSTRAINT.en);
  if (input.productShot && category) parts.push(CATEGORY_CONSTRAINTS[category].en);
  parts.push(SOUND_DIRECTION.en);
  parts.push(QUALITY_TAIL.en);
  return parts.join(". ") + ".";
}
