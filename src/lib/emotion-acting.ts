/**
 * Emotion-acting process library — embodied "process, not verdict" performance phrases.
 *
 * Why this exists: prompts that name an emotional END STATE ("she looks sad", "excited
 * face") push video models toward frozen theatrical masks — the single most common
 * acting tell. Real performances read as a PROCESS: something triggers, the body
 * registers it first (breath, shoulders, lean), and the face reacts last and stays
 * restrained. This module maps each commerce beat (shot type) to its default emotional
 * register and provides short process phrases across four body zones (eyes / mouth /
 * breath-neck / shoulders) that read as lived behavior instead of a posed expression.
 *
 * Consumers:
 *  - motion-prompt.ts: appends one process phrase to i2v prompts for non-talking
 *    person shots (talking shots already carry their own behavior-beat direction).
 *  - tts.ts / compose route: `shotEmotion` doubles as the per-shot default for
 *    expressive-TTS emotion parameters (providers that support one).
 *
 * Pure data + pure functions, no I/O.
 */

/** The emotional registers a commerce short actually uses (deliberately small). */
export type ActingEmotion = "eager" | "troubled" | "curious" | "focused" | "delighted" | "confident";

/** Shot type → the default emotional register of that beat in a commerce short. */
const SHOT_EMOTION: Record<string, ActingEmotion> = {
  hook: "eager",
  pain_point: "troubled",
  product_reveal: "curious",
  demo: "focused",
  social_proof: "delighted",
  cta: "confident",
};

/** Default emotional register for a shot type (undefined for unknown types). */
export function shotEmotion(shotType: string | undefined): ActingEmotion | undefined {
  return SHOT_EMOTION[String(shotType ?? "")];
}

/**
 * Process phrases per register. Every phrase is written as trigger → body-first →
 * restrained face, and NEVER names the end state ("sad", "thrilled") — end-state
 * words are exactly what freezes the model into a mask.
 */
const EMOTION_PROCESS: Record<ActingEmotion, { en: string }[]> = {
  eager: [
    { en: "the eyes light up first, the body leaning in slightly without meaning to" },
    { en: "breath quickens a touch, words arriving before the expression, the smile catching up slowly" },
  ],
  troubled: [
    { en: "the brow tightens first, gaze drifting away as the shoulders sink a little" },
    { en: "lips press together for half a second, a barely audible sigh through the nose" },
  ],
  curious: [
    { en: "the head tilts slightly, the eyes moving in to inspect before the body follows" },
    { en: "an eyebrow lifts a touch as the hands slow down" },
  ],
  focused: [
    { en: "eyes locked on the hands at work, breathing slowed, shoulders and neck settled" },
    { en: "the gaze follows the motion intently, with an occasional small nod" },
  ],
  delighted: [
    { en: "the corners of the eyes soften first, the smile arriving slowly after" },
    { en: "the shoulders release as the whole body eases back a little" },
  ],
  confident: [
    { en: "chin slightly tucked, gaze settling steadily on the camera, unhurried" },
    { en: "shoulders open and squared, one palm pressing gently downward" },
  ],
};

/**
 * One process phrase for the register, rotated deterministically by seed (batch runs
 * must not repeat the same body language across every shot — repetition reads as AI).
 */
export function emotionActingLine(emotion: ActingEmotion, seed: number, lang: "en"): string {
  const pool = EMOTION_PROCESS[emotion];
  const i = ((Math.floor(seed) % pool.length) + pool.length) % pool.length;
  return pool[i][lang];
}

/**
 * Expressive-TTS mapping per register:
 *  - emotion: provider voice_setting.emotion enum value (whitelisted again in tts.ts)
 *  - instruction: a natural-language delivery note for OpenAI-style TTS models that
 *    accept an `instructions` parameter
 * Registers whose delivery is effectively neutral map to "neutral" — sending a forced
 * emotion where none is wanted sounds worse than sending nothing.
 */
export const EMOTION_TTS: Record<ActingEmotion, { emotion: string; instruction: string }> = {
  eager: { emotion: "happy", instruction: "Eager with a little excitement, like you can't wait to share" },
  troubled: { emotion: "sad", instruction: "Troubled and resigned, like venting to a friend" },
  curious: { emotion: "surprised", instruction: "Curious with a hint of surprise, like you just discovered something" },
  focused: { emotion: "neutral", instruction: "Steady and focused, like talking while doing it" },
  delighted: { emotion: "happy", instruction: "Relaxed and satisfied, like it genuinely feels great to use" },
  confident: { emotion: "neutral", instruction: "Confident and crisp, never pushy" },
};
