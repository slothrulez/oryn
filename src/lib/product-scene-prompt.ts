/**
 * Prompts for the quick-cut "AI scenes" stage: one product-specific image per shot, redrawn from the
 * merchant's product photo (image-to-image) so the exact product appears in the scene the script describes.
 */
const HERO_SHOT_TYPES = new Set(["product_reveal", "product_intro", "cta"]);

/** Director notes per beat: lens, light, mood. Keeps the ad reading like one commercial, not ten stills. */
const DIRECTOR_NOTES: Record<string, string> = {
  hook: "Director: 35mm lens, eye-level, slightly off-centre framing, bright natural daylight, energetic mood, an everyday moment viewers recognise.",
  pain_point: "Director: 50mm lens, tighter medium shot, cooler and flatter light than the hook, a touch of mess or frustration in the frame, restrained mood.",
  product_reveal: "Director: 85mm lens, clean centred hero composition, warm key light with a soft rim light, premium calm mood, product fills the frame.",
  demo: "Director: 50mm lens, hands and product in action, warm practical light, tactile detail (texture, liquid, motion blur), upbeat mood.",
  social_proof: "Director: 35mm lens, lifestyle wide-to-medium shot of a real person enjoying the result, golden-hour warmth, relaxed happy mood.",
  cta: "Director: 85mm lens, product slightly low in frame leaving clear space above it, bright premium light, confident closing mood.",
};

/** Script descriptions often call for on-screen text ("Text overlay: 'Buy now'"); the image must stay text-free (captions are burned in later). */
export function stripTextDirectives(description: string): string {
  return description
    .replace(/["“”'‘’][^"“”'‘’]{2,80}["“”'‘’]/g, "")
    .replace(/\b(text overlays?|on-screen text|captions?|title cards?)\b(\s+(showing|reading|that reads?|saying|with))?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
}

export interface SceneDirection {
  /** description of the shot before this one, for continuity */
  previous?: string;
  /** add lens/light/mood director notes (cinematic profile) */
  notes?: boolean;
}

export function buildProductScenePrompt(description: string, hasProductPhoto: boolean, shotType?: string, direction: SceneDirection = {}): string {
  const base = stripTextDirectives(description).replace(/\.$/, "") || "The product in a clean, bright lifestyle setting";
  const fidelity = hasProductPhoto
    ? " Keep the product's look, packaging, colors, logo and text exactly unchanged; only redraw the scene, background and lighting to match the description."
    : "";
  // hero frames (reveal, CTA) stay closest to the product photo; every other shot must read as a new setup
  const variety = hasProductPhoto && !(shotType && HERO_SHOT_TYPES.has(shotType))
    ? " Use a clearly different camera angle, distance and composition from the reference photo so this scene feels like a new shot."
    : "";
  const notes = direction.notes ? ` ${(shotType && DIRECTOR_NOTES[shotType]) || DIRECTOR_NOTES.demo}` : "";
  const continuity = direction.previous
    ? ` Continuity: this follows a shot of "${stripTextDirectives(direction.previous).slice(0, 140)}"; keep the same world, colour palette and time of day.`
    : "";
  return `${base}.${fidelity}${variety}${notes}${continuity} Vertical 9:16 commercial product photography, photorealistic, ${direction.notes ? "cinematic colour grade" : "premium soft lighting"}, shallow depth of field. Absolutely no added text, letters, numbers, captions, overlays, price tags or watermarks anywhere in the image.`;
}

/** Camera-frame prompts start with this so the composer can tell extra frames from the hero still. */
export const CAMERA_FRAME_PROMPT_PREFIX = "The exact same scene";

/** Second/third camera position of an already generated scene, so the composer can move between them. */
export function buildCameraFramePrompt(index: number): string {
  const move = index === 0
    ? "the camera has moved about 20% closer and slightly to the left"
    : "the camera has moved slightly to the right and a little lower, with the product still the subject";
  return `${CAMERA_FRAME_PROMPT_PREFIX}, product, people, lighting and colour grade as the reference image, as the next frame of one continuous take: ${move}. Nothing else changes. Photorealistic, no added text or overlays.`;
}
