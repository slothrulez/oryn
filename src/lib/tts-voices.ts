/**
 * Free Edge TTS voice catalogue — CLIENT-SAFE module (no fs/network imports), so UI code and the
 * variation planner can list voices without dragging the server-only TTS pipeline (edge-tts →
 * tts-cache → fs/promises) into the browser bundle. edge-tts re-exports these for server callers.
 *
 * All entries are real Edge keyless-synthesisable voices (server-tested to produce 18–26 KB mp3);
 * generateSpeechFree already accepts any Edge voice name — this list simply makes voices discoverable.
 */
export const FREE_TTS_VOICES: { value: string; label: string; gender: "female" | "male"; lang: string }[] = [
  { value: "en-US-AvaNeural", label: "Ava · US English, conversational (female)", gender: "female", lang: "en-US" },
  { value: "en-US-AndrewNeural", label: "Andrew · US English, conversational (male)", gender: "male", lang: "en-US" },
  { value: "en-US-EmmaNeural", label: "Emma · US English, cheerful (female)", gender: "female", lang: "en-US" },
  { value: "en-US-BrianNeural", label: "Brian · US English, casual (male)", gender: "male", lang: "en-US" },
  { value: "en-US-JennyNeural", label: "Jenny · US English (female)", gender: "female", lang: "en-US" },
  { value: "en-US-AriaNeural", label: "Aria · US English, newsreader (female)", gender: "female", lang: "en-US" },
  { value: "en-US-GuyNeural", label: "Guy · US English (male)", gender: "male", lang: "en-US" },
  { value: "en-US-ChristopherNeural", label: "Christopher · US English (male)", gender: "male", lang: "en-US" },
  { value: "en-GB-SoniaNeural", label: "Sonia · UK English (female)", gender: "female", lang: "en-GB" },
  { value: "en-GB-RyanNeural", label: "Ryan · UK English (male)", gender: "male", lang: "en-GB" },
  { value: "en-GB-LibbyNeural", label: "Libby · UK English (female)", gender: "female", lang: "en-GB" },
  { value: "en-AU-NatashaNeural", label: "Natasha · Australian English (female)", gender: "female", lang: "en-AU" },
  { value: "en-CA-ClaraNeural", label: "Clara · Canadian English (female)", gender: "female", lang: "en-CA" },
  { value: "en-CA-LiamNeural", label: "Liam · Canadian English (male)", gender: "male", lang: "en-CA" },
];

export const DEFAULT_FREE_VOICE = "en-US-AvaNeural";

/** Native English Edge voices only; anything else (e.g. a stale non-English voice saved in old settings) falls back to the default. */
export function resolveFreeVoice(voice: string | undefined | null): string {
  const v = (voice || "").trim();
  return /^en-[A-Z]{2}-[A-Za-z]+Neural$/.test(v) ? v : DEFAULT_FREE_VOICE;
}
