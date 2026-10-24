import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_TTS_PROVIDER, type TTSProvider } from "@/lib/tts-presets";
import {
  DEFAULT_IMAGE_PARAMS,
  DEFAULT_VIDEO_PARAMS,
  type CustomModel,
  type ImageGenParams,
  type VideoGenParams,
} from "@/lib/gen-params";
import { ATLAS_BASE_URL, ATLAS_LLM_BASE_URL, ATLAS_ONEKEY_MODELS, fillAtlasModelDefaults } from "@/lib/atlas-onekey";
import type { MotionIntensity, MotionRealismTier } from "@/lib/motion-prompt";
import {
  isProductionProfileId,
  productionProfilePatch,
  type ProductionProfileId,
} from "@/lib/production-profiles";

// AI provider config
export interface ProviderSetting {
  enabled: boolean;
  apiKey: string;
  baseUrl?: string;
}

// LLM config
export interface LLMSetting {
  provider: string; // custom name
  baseUrl: string;
  apiKey: string;
  model: string;
  visionModel?: string; // vision analysis model
}

// TTS voiceover config (multi-platform: OpenAI-compatible / Atlas / fal.ai)
export interface TTSSetting {
  enabled: boolean;
  /** Platform, default "openai" (older configs without this field are treated as openai) */
  provider?: TTSProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  speed?: number;
  /** Optional GroupId (legacy field) */
  groupId?: string;
}

export interface SettingsState {
  // AI platform config
  providers: Record<string, ProviderSetting>;
  // LLM config
  llm: LLMSetting;
  // TTS voiceover config
  tts: TTSSetting;
  // default image model
  defaultImageModel: string;
  // default video model
  defaultVideoModel: string;
  // default resolution
  defaultResolution: "720p" | "1080p";
  /** Refuse a single paid generation whose estimate exceeds this many USD (0 = no cap) */
  spendCapUsd: number;
  // default aspect ratio
  defaultAspectRatio: "9:16" | "16:9" | "1:1";
  // user custom models (any model id attached to an existing platform)
  customModels: CustomModel[];
  // global image-generation defaults
  imageParams: ImageGenParams;
  // global video-generation defaults
  videoParams: VideoGenParams;
  // i2v camera-motion strength tier (light/medium/strong, affects the motion prompt's camera wording)
  motionIntensity: MotionIntensity;
  // i2v physical-realism layer tier (auto=all layers / constraints=category constraints only / off=disabled)
  motionRealism: MotionRealismTier;
  // i2v seam mode (pin=pin the next shot's keyframe as the tail frame [default] / tail=use the previous shot's real last frame as the first frame / off=no chaining)
  chainMode: "pin" | "tail" | "off";
  // global visual look (look-presets.ts preset id, "none"=off; injected into image prompts and i2v lighting anchors)
  visualLook: string;
  // UI complexity mode: "simple" keeps only the happy path (beginner default),
  // "pro" reveals the director panel, per-shot camera tools, template workshop etc.
  uiMode: "simple" | "pro";
  // current production plan for the creative goal (atomically updates the provider-agnostic params below)
  activeProductionProfile: ProductionProfileId;

  // Actions
  setProvider: (name: string, setting: ProviderSetting) => void;
  setLLM: (llm: LLMSetting) => void;
  setTTS: (tts: TTSSetting) => void;
  setDefaultImageModel: (model: string) => void;
  setDefaultVideoModel: (model: string) => void;
  setDefaultResolution: (resolution: "720p" | "1080p") => void;
  setSpendCapUsd: (usd: number) => void;
  setDefaultAspectRatio: (ratio: "9:16" | "16:9" | "1:1") => void;
  addCustomModel: (model: CustomModel) => void;
  removeCustomModel: (id: string) => void;
  setImageParams: (params: ImageGenParams) => void;
  setVideoParams: (params: VideoGenParams) => void;
  setMotionIntensity: (intensity: MotionIntensity) => void;
  setMotionRealism: (tier: MotionRealismTier) => void;
  setChainMode: (mode: "pin" | "tail" | "off") => void;
  setVisualLook: (look: string) => void;
  setUiMode: (mode: "simple" | "pro") => void;
  applyProductionProfile: (profile: ProductionProfileId) => void;
  /** One Atlas key sets up everything: script + vision + images + video + voiceover (doesn't override models the user picked or voiceover already enabled) */
  applyAtlasOneKey: (apiKey: string) => void;
}

/** Pollinations' new endpoint (the old keyless text.pollinations.ai API is retired) */
const POLLINATIONS_BASE_URL = "https://gen.pollinations.ai/v1";

/**
 * Version migrations for persisted settings (pure function, unit-testable).
 *
 * v1: clean up invalid model names written by older presets (old presets used nonexistent model IDs; "Test connection" only checks the key,
 * not the model name, so it looked fine until script generation failed with Model Not Exist — the issue #12 scenario).
 * Only rewrite when baseUrl matches the official endpoint, to avoid touching same-named custom models on self-hosted proxies.
 *
 * v2: Pollinations' keyless free text API (text.pollinations.ai/openai) is retired and only returns
 * 402/502 (issue #19: selecting Pollinations and generating immediately failed with 402 Payment Required on Mac/Win).
 * Move the URL to the new official endpoint gen.pollinations.ai/v1 and clear the placeholder key "pollinations" written by old presets —
 * the new endpoint requires a real registered key; keeping the placeholder would disguise a 401 as "configured". Once cleared, Settings clearly asks for a key.
 *
 * v3: change the Ollama preset's localhost to 127.0.0.1. On Windows localhost resolves to ::1 first while Ollama
 * only listens on 127.0.0.1 by default, giving an undiagnosable "can't connect" (issue #19 follow-up). Same port and machine, no side effects.
 */
export function migrateSettings(state: SettingsState): SettingsState {
  const llm = state?.llm;
  if (llm?.baseUrl) {
    const fixes: Array<{ hostRe: RegExp; from: string; to: string }> = [
    ];
    for (const f of fixes) {
      if (!f.hostRe.test(llm.baseUrl)) continue;
      if (llm.model === f.from) llm.model = f.to;
      if (llm.visionModel === f.from) llm.visionModel = f.to;
    }

    // Atlas one-key used to write the media base into the LLM slot, so every script generation
    // 404'd on a model that does exist (issue #24). Move those installs onto the chat gateway.
    if (/^https?:\/\/api\.atlascloud\.ai\/api\/v1\/?$/i.test(llm.baseUrl)) {
      llm.baseUrl = ATLAS_LLM_BASE_URL;
    }

    if (/text\.pollinations\.ai/i.test(llm.baseUrl)) {
      llm.baseUrl = POLLINATIONS_BASE_URL;
      if (llm.apiKey === "pollinations") llm.apiKey = "";
    }

    llm.baseUrl = llm.baseUrl.replace(/^(https?:\/\/)localhost(:11434\b)/i, "$1127.0.0.1$2");
  }
  if (!isProductionProfileId(state?.activeProductionProfile)) {
    state.activeProductionProfile = "balanced";
  }
  return state;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      providers: {
        "atlas-cloud": { enabled: false, apiKey: "" },
        "fal-ai": { enabled: false, apiKey: "" },
        replicate: { enabled: false, apiKey: "" },
        openai: { enabled: false, apiKey: "" },
      },
      llm: {
        provider: "",
        baseUrl: "",
        apiKey: "",
        model: "",
        visionModel: "",
      },
      tts: {
        enabled: false,
        provider: DEFAULT_TTS_PROVIDER,
        baseUrl: "",
        apiKey: "",
        model: "",
        voice: "",
        speed: 1,
      },
      defaultImageModel: "",
      defaultVideoModel: "",
      defaultResolution: "720p",
      // a per-run ceiling, on by default: an unattended run used to be able to spend
      // whatever the model charged, with no figure shown beforehand (issue #28)
      spendCapUsd: 5,
      defaultAspectRatio: "9:16",
      customModels: [],
      imageParams: DEFAULT_IMAGE_PARAMS,
      videoParams: DEFAULT_VIDEO_PARAMS,
      motionIntensity: "normal",
      motionRealism: "auto",
      chainMode: "pin",
      visualLook: "none",
      uiMode: "simple",
      activeProductionProfile: "balanced",
      setProvider: (name, setting) =>
        set((state) => ({
          providers: { ...state.providers, [name]: setting },
        })),
      setLLM: (llm) => set({ llm }),
      setTTS: (tts) => set({ tts }),
      setDefaultImageModel: (model) => set({ defaultImageModel: model }),
      setDefaultVideoModel: (model) => set({ defaultVideoModel: model }),
      setDefaultResolution: (resolution) => set({ defaultResolution: resolution }),
      setSpendCapUsd: (usd) => set({ spendCapUsd: Number.isFinite(usd) && usd >= 0 ? usd : 0 }),
      setDefaultAspectRatio: (ratio) => set({ defaultAspectRatio: ratio }),
      addCustomModel: (model) =>
        set((state) => ({ customModels: [...state.customModels, model] })),
      removeCustomModel: (id) =>
        set((state) => ({ customModels: state.customModels.filter((m) => m.id !== id) })),
      setImageParams: (params) => set({ imageParams: params }),
      setVideoParams: (params) => set({ videoParams: params }),
      setMotionIntensity: (intensity) => set({ motionIntensity: intensity }),
      setMotionRealism: (tier) => set({ motionRealism: tier }),
      setChainMode: (mode) => set({ chainMode: mode }),
      setVisualLook: (look) => set({ visualLook: look }),
      setUiMode: (mode) => set({ uiMode: mode }),
      applyProductionProfile: (profile) =>
        set((state) => productionProfilePatch(profile, state)),
      // One Atlas key sets up the whole suite: LLM script + vision + images + video + Atlas voiceover
      applyAtlasOneKey: (apiKey) =>
        set((state) => {
          const key = apiKey.trim();
          const def = fillAtlasModelDefaults({
            image: state.defaultImageModel,
            video: state.defaultVideoModel,
          });
          return {
            llm: {
              provider: "Atlas Cloud",
              // chat gateway, not ATLAS_BASE_URL — the media base 404s every chat call (issue #24)
              baseUrl: ATLAS_LLM_BASE_URL,
              apiKey: key,
              model: ATLAS_ONEKEY_MODELS.llm,
              visionModel: ATLAS_ONEKEY_MODELS.vision,
            },
            providers: {
              ...state.providers,
              "atlas-cloud": { ...state.providers["atlas-cloud"], enabled: true, apiKey: key },
            },
            defaultImageModel: def.image,
            defaultVideoModel: def.video,
            // voiceover: only default to Atlas TTS (reusing the same key) if it was never enabled; leave existing config untouched
            tts: state.tts.enabled
              ? state.tts
              : { ...state.tts, enabled: true, provider: "atlas", baseUrl: ATLAS_BASE_URL, model: "", voice: "" },
          };
        }),
    }),
    {
      name: "oryn-settings",
      // v1: clean up invalid model names written by older presets (old presets used nonexistent model IDs; "Test connection" only checks the key,
      // not the model name, so it looked fine until script generation failed with Model Not Exist — the issue #12 scenario).
      // Only rewrite when baseUrl matches the official endpoint, to avoid touching same-named custom models on self-hosted proxies.
      // v2: move the retired keyless Pollinations URL to the new endpoint (see the migrateSettings comment).
      // v3: rewrite Ollama's localhost:11434 to 127.0.0.1:11434 (::1 fails on Windows).
      // v4: add the creative-goal production plan; old settings migrate to balanced (quality/cost trade-off).
      // v5: Atlas one-key setup once wrote the asset gateway /api/v1 into the LLM URL, so scripts always 404'd (issue #24);
      // migrate to the OpenAI-compatible chat gateway /v1.
      version: 5,
      migrate: (persisted) => migrateSettings(persisted as SettingsState),
    }
  )
);
