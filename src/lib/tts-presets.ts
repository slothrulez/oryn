/**
 * Paid TTS platform presets (pure data, shared between client and server, no server-only dependencies).
 *
 * Unified "platform" dropdown: OpenAI-compatible / Atlas Cloud / fal.ai.
 * Atlas and fal reuse the API key already entered under the same provider in the "AI Platform" tab.
 * Each platform provides default baseUrl/model/voice so the UI can conditionally render fields
 * and offer voice suggestions accordingly.
 */

export type TTSProvider = "openai" | "atlas";

export interface TTSVoiceOption {
  value: string;
  label: string;
}

export interface TTSProviderMeta {
  value: TTSProvider;
  label: string;
  /** Default baseUrl for this platform's TTS endpoint */
  baseUrl: string;
  /** Default model id */
  defaultModel: string;
  /** Available models (empty means free-form input, e.g. OpenAI-compatible) */
  models: TTSVoiceOption[];
  /** Default voice id */
  defaultVoice: string;
  /** Suggested voice list */
  voices: TTSVoiceOption[];
  /**
   * Key source:
   * - "tts": use the apiKey stored in the TTS config itself (OpenAI-compatible)
   * - others: reuse the apiKey of the matching provider in the "AI Platform" store (atlas-cloud / fal-ai)
   */
  keySource: "tts" | "atlas-cloud" | "fal-ai";
  /** Whether to expose a baseUrl input field (OpenAI-compatible supports custom endpoints) */
  editableBaseUrl?: boolean;
  /** Configuration hint shown in the UI */
  hint?: string;
}

/** OpenAI-compatible quick presets (one click populates baseUrl + model + voice) */
export const OPENAI_TTS_PRESETS = [
  { label: "OpenAI tts-1", baseUrl: "https://api.openai.com/v1", model: "tts-1", voice: "alloy" },
];

export const TTS_PROVIDERS: TTSProviderMeta[] = [
  {
    value: "openai",
    label: "OpenAI-compatible (/audio/speech)",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "tts-1",
    models: [],
    defaultVoice: "alloy",
    voices: [],
    keySource: "tts",
    editableBaseUrl: true,
    hint: "Works with OpenAI tts-1 and any other /audio/speech endpoint.",
  },
  {
    value: "atlas",
    label: "Atlas Cloud (xAI TTS)",
    baseUrl: "https://api.atlascloud.ai/api/v1",
    defaultModel: "xai/tts-v1",
    models: [{ value: "xai/tts-v1", label: "xAI TTS v1 (multilingual, high fidelity)" }],
    defaultVoice: "eve",
    voices: [
      { value: "eve", label: "Eve · female (default)" },
      { value: "leo", label: "Leo · male" },
      { value: "rex", label: "Rex · male" },
      { value: "ara", label: "Ara · female" },
      { value: "sal", label: "Sal · male" },
    ],
    keySource: "atlas-cloud",
    hint: "Reuses the Atlas Cloud key from AI platforms (same key as image/video generation).",
  },

];

export const DEFAULT_TTS_PROVIDER: TTSProvider = "openai";

/** Get platform metadata (with fallback: unknown/legacy config falls back to openai) */
export function getTTSProviderMeta(provider?: string | null): TTSProviderMeta {
  return TTS_PROVIDERS.find((p) => p.value === provider) ?? TTS_PROVIDERS[0];
}

/** Minimal input shape required when resolving TTS config (avoids circular dependency with store types) */
interface TTSSettingLike {
  enabled?: boolean;
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  voice?: string;
  speed?: number;
  groupId?: string;
}
type ProvidersLike = Record<string, { apiKey?: string; baseUrl?: string } | undefined>;

/** Fully resolved TTS config used for actual requests / preview playback */
export interface ResolvedTTSConfig {
  provider: TTSProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  speed?: number;
  groupId?: string;
}

/**
 * Resolves the "platform selection + reused AI platform key" into a complete TTS config
 * ready to send to the backend.
 * Atlas keys are taken from the providers store; OpenAI-compatible providers use the TTS's own key.
 */
export function resolveTTSConfig(tts: TTSSettingLike | undefined, providers: ProvidersLike): ResolvedTTSConfig {
  const meta = getTTSProviderMeta(tts?.provider);
  // baseUrl: for editable platforms use the user-provided value (fall back to default if blank); otherwise force the platform default
  const baseUrl = meta.editableBaseUrl ? (tts?.baseUrl || meta.baseUrl) : meta.baseUrl;
  // apiKey: reuse the AI platform key or use the TTS-specific key
  const apiKey = meta.keySource === "tts" ? (tts?.apiKey || "") : (providers?.[meta.keySource]?.apiKey || "");
  return {
    provider: meta.value,
    baseUrl,
    apiKey,
    model: tts?.model || meta.defaultModel,
    voice: tts?.voice || meta.defaultVoice,
    ...(tts?.speed != null && { speed: tts.speed }),
  };
}

/** Whether paid TTS is ready (switch enabled + resolved key/model/voice all present) */
export function isPaidTTSReady(tts: TTSSettingLike | undefined, providers: ProvidersLike): boolean {
  if (!tts?.enabled) return false;
  const c = resolveTTSConfig(tts, providers);
  return Boolean(c.apiKey && c.baseUrl && c.model && c.voice);
}
