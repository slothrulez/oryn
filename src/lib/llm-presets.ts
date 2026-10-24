/**
 * One-click LLM presets shown in Settings.
 *
 * Extracted from the settings page so the endpoints are unit-testable: a preset that ships a dead
 * endpoint silently bricks the whole app for anyone who clicks it (issue #19 — Pollinations retired
 * its keyless text API, and every new install that picked that preset failed with a bare 402).
 *
 * `tipKey` is an i18n message key resolved at render time; `apiKey` pre-fills a placeholder only for
 * endpoints that genuinely ignore the key (local Ollama). Never pre-fill a placeholder for an endpoint
 * that requires a real key — it disguises "not configured" as "configured".
 */
export interface LLMPreset {
  label: string;
  baseUrl: string;
  model: string;
  /** i18n key for the short tip shown next to the label (empty = no tip) */
  tipKey?: string;
  /** placeholder key for keyless endpoints only */
  apiKey?: string;
}

export const LLM_PRESETS: LLMPreset[] = [
  // Gemini 2.5 Flash on Atlas: fast, clean JSON output
  { label: "Atlas Cloud", baseUrl: "https://api.atlascloud.ai/v1", model: "google/gemini-2.5-flash", tipKey: "presetAtlasTip" },
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o", tipKey: "presetOpenrouterTip" },
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-5.4" },
  // 127.0.0.1 rather than localhost: on Windows, localhost resolves to ::1 first while Ollama binds
  // 127.0.0.1 only, so the hostname form can fail to connect for reasons the user cannot see.
  // The model must match a pulled tag exactly — `ollama pull llama3.2` installs exactly this id.
  { label: "Ollama (local)", baseUrl: "http://127.0.0.1:11434/v1", model: "llama3.2", tipKey: "presetOllamaTip", apiKey: "ollama" },
  // Pollinations moved to gen.pollinations.ai with a sign-up daily free tier; the old keyless
  // text.pollinations.ai endpoint now only returns 402/502 (issue #19), so no placeholder key.
  { label: "Pollinations", baseUrl: "https://gen.pollinations.ai/v1", model: "openai-fast", tipKey: "presetPollinationsTip" },
];
