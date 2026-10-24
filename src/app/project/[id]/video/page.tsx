"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { LuArrowLeft, LuPlay, LuChevronDown, LuArrowRight, LuLoaderCircle, LuMic, LuCheck, LuX } from "react-icons/lu";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { FREE_TTS_VOICES, DEFAULT_FREE_VOICE } from "@/lib/tts-voices";
import { resolveTTSConfig, isPaidTTSReady, getTTSProviderMeta } from "@/lib/tts-presets";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useT, useLocale } from "@/lib/i18n";
import { RENDER_PRESETS, DEFAULT_RENDER_PRESET, type RenderPreset } from "@/lib/compose-presets";
import { BUILTIN_STYLE_PACKS, parseStylePack, serializeStylePack, STYLE_PACK_FORMAT, type StylePack } from "@/lib/style-packs";
import { decodeStoredAdTemplate, adTemplateStorageKey, adTemplateAppliedKey } from "@/lib/ad-templates";
import { buildHookVariants } from "@/lib/script-engine/hook-variants";
import type { ProductCategory } from "@/lib/script-engine/templates";
import { CAPTION_PRESET_IDS } from "@/lib/caption-presets";
import { ProjectHeader } from "@/components/project-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Shot } from "@/lib/db/schema";

// Video clip
interface VideoClipItem {
  shotId: number;
  type: Shot["type"];
  duration: number;
  voiceover: string;
  transition: "ai_start_end" | "ai_reference" | "direct_concat" | "ffmpeg_fade";
}

// Compose settings
interface ComposeConfig {
  ttsEnabled: boolean;
  ttsVoice: string;
  /** Free TTS voice (used when no paid TTS is configured) */
  freeVoice: string;
  bgm: string;
  subtitleSize: number;
  subtitlePosition: "bottom" | "center" | "top";
  aspectRatio: "9:16" | "16:9" | "1:1";
  resolution: "720p" | "1080p";
  /** Render quality preset: fast/standard/HD (sets resolution + encoding speed/quality) */
  renderPreset: RenderPreset;
  /** Product: end-card purchase CTA overlay */
  ctaEnabled: boolean;
  ctaText: string;
  /** Product: bottom-left product card overlay (thumbnail + name + buy prompt; needs a product image) */
  productCard: boolean;
  /** caption style preset: standard boxed / bold punch / minimal / word-by-word karaoke */
  captionPreset: "standard" | "bold" | "minimal" | "karaoke";
  /** Voiceover ducking: lower the BGM while the voiceover speaks and bring it back in pauses */
  bgmDuck: boolean;
  /** Music level (normalized 0..1; the backend clamps it again) */
  bgmVolume: number;
  /** voice grounding: TTS de-broadcast chain + room-tone bed (default on; off = clean studio read) */
  voiceGround: boolean;
}

// Free voiceover voices (Microsoft Edge keyless TTS, no key needed): native English voices only
const freeVoiceOptions = FREE_TTS_VOICES;

// Background music options (label is an i18n key)
const bgmOptions = [
  { value: "none", labelKey: "bgmNone" },
  { value: "upbeat", labelKey: "bgmUpbeat" },
  { value: "chill", labelKey: "bgmChill" },
  { value: "energetic", labelKey: "bgmEnergetic" },
  { value: "emotional", labelKey: "bgmEmotional" },
];

// Transition labels (values are i18n keys)
const transitionLabels: Record<string, string> = {
  ai_start_end: "transitionAiStartEnd",
  ai_reference: "transitionAiReference",
  direct_concat: "transitionDirectConcat",
  ffmpeg_fade: "transitionFfmpegFade",
};

// Shot type labels (labelKey is an i18n key)
const shotTypeLabels: Record<Shot["type"], { labelKey: string; color: string }> = {
  hook: { labelKey: "shotHook", color: "bg-red-500/20 text-red-400" },
  pain_point: { labelKey: "shotPainPoint", color: "bg-orange-500/20 text-orange-400" },
  product_reveal: { labelKey: "shotProductReveal", color: "bg-blue-500/20 text-blue-400" },
  demo: { labelKey: "shotDemo", color: "bg-green-500/20 text-green-400" },
  social_proof: { labelKey: "shotSocialProof", color: "bg-foreground/10 text-foreground" },
  cta: { labelKey: "shotCta", color: "bg-amber-500/20 text-amber-400" },
};

interface DbShot {
  shotId: number;
  type: VideoClipItem["type"];
  duration: number;
  voiceover: string;
  transition: VideoClipItem["transition"];
}

// Shot assets (only the fields needed for thumbnails)
interface DbAsset {
  shotId: number;
  filePath: string | null;
  status: string;
}

// Whether an asset is an image or a video (videos use <video> as the poster, images use <img>)
const isVideoPath = (p: string) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(p);

export default function VideoPage() {
  const t = useT("video");
  const locale = useLocale();
  const { id } = useParams<{ id: string }>();
  const { defaultResolution, defaultAspectRatio, tts, providers } = useSettingsStore();
  const [clips, setClips] = useState<VideoClipItem[]>([]);
  // Shot thumbnails: shotId → asset file path (previews each clip directly in the timeline)
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<ComposeConfig>({
    ttsEnabled: true,
    ttsVoice: "female-gentle",
    freeVoice: DEFAULT_FREE_VOICE,
    bgm: "upbeat",
    subtitleSize: 24,
    subtitlePosition: "bottom",
    aspectRatio: "9:16",
    resolution: "1080p",
    renderPreset: DEFAULT_RENDER_PRESET,
    ctaEnabled: false,
    ctaText: "", // empty by default; prefilled with ctaPlaceholder when enabled
    productCard: false,
    captionPreset: "standard",
    bgmDuck: true,
    bgmVolume: 0.18,
    voiceGround: true,
  });

  // Compose status
  const [isComposing, setIsComposing] = useState(false);
  const [composeProgress, setComposeProgress] = useState(0);
  const [composeDone, setComposeDone] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  // Background music
  const [bgm, setBgm] = useState<{ path: string; name: string } | null>(null);
  const [bgmUploading, setBgmUploading] = useState(false);
  // Whether paid TTS is configured (otherwise the voiceover uses free Edge keyless TTS)
  const paidTtsReady = isPaidTTSReady(tts, providers);
  // Free voice preview state
  const [previewingVoice, setPreviewingVoice] = useState(false);

  // Preview a free voice: synthesize a short clip and play it
  const previewFreeVoice = async () => {
    if (previewingVoice) return;
    setPreviewingVoice(true);
    try {
      const res = await fetch("/api/tts/free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: config.freeVoice, text: t("ttsPreviewText") }),
      });
      if (!res.ok) throw new Error(t("errorPreviewFailed"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      /* preview failures are silent (don't block the main flow) */
    } finally {
      setPreviewingVoice(false);
    }
  };
  const uploadBgm = async (file: File) => {
    setBgmUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/project/${id}/bgm`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errorUploadFailed"));
      setBgm({ path: data.path, name: data.name });
    } catch {
      setBgm(null);
    } finally {
      setBgmUploading(false);
    }
  };

  // Load the real shots (selected script) + project name + default visual settings
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [projectRes, scriptsRes, assetsRes] = await Promise.all([
          fetch(`/api/project/${id}`),
          fetch(`/api/project/${id}/scripts`),
          fetch(`/api/project/${id}/assets`),
        ]);
        const project = projectRes.ok ? await projectRes.json() : null;
        const scripts = scriptsRes.ok ? await scriptsRes.json() : [];
        const assets = assetsRes.ok ? await assetsRes.json() : [];
        if (cancelled) return;
        if (project) {
          setProjectName(project.name ?? project.productName ?? "");
          setProjectCategory(typeof project.productCategory === "string" ? project.productCategory : "");
          if (Array.isArray(project.productionWorkflow)) {
            const voiceStage = project.productionWorkflow.find((stage: { id?: unknown }) => stage.id === "voice");
            if (voiceStage) setConfig((current) => ({ ...current, ttsEnabled: voiceStage.enabled !== false }));
          }
        }
        // collect each shot's generated visual as a timeline thumbnail (only completed ones with a file)
        const thumbMap: Record<number, string> = {};
        for (const a of (Array.isArray(assets) ? assets : []) as DbAsset[]) {
          if (a && typeof a.shotId === "number" && a.filePath && a.status === "done" && thumbMap[a.shotId] == null) {
            thumbMap[a.shotId] = a.filePath;
          }
        }
        setThumbs(thumbMap);
        const selected = Array.isArray(scripts)
          ? scripts.find((s: { selected?: boolean }) => s.selected) ?? scripts[0]
          : null;
        if (!selected || !Array.isArray(selected.shots) || selected.shots.length === 0) {
          setLoadError(t("errorNoScript"));
          setClips([]);
        } else {
          // raw shots feed the variant matrix (hook rewrites need full Shot objects)
          setScriptShots(selected.shots as Shot[]);
          setClips(
            (selected.shots as DbShot[]).map((s) => ({
              shotId: s.shotId,
              type: s.type,
              duration: s.duration,
              voiceover: s.voiceover ?? "",
              transition: s.transition ?? "ai_start_end",
            }))
          );
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : t("errorLoadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Initialize once from the default resolution/aspect ratio in settings
  useEffect(() => {
    setConfig((c) => ({ ...c, resolution: defaultResolution, aspectRatio: defaultAspectRatio }));
  }, [defaultResolution, defaultAspectRatio]);

  // Production-console preview hand-off: select the existing real fast profile
  // (720p / veryfast / CRF 26) without touching any paid generation stage.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("renderPreset") !== "fast") return;
    setConfig((current) => ({ ...current, renderPreset: "fast", resolution: RENDER_PRESETS.fast.resolution }));
  }, []);

  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);

  // Update a clip's transition
  const updateTransition = (shotId: number, transition: string) => {
    setClips((prev) =>
      prev.map((c) =>
        c.shotId === shotId ? { ...c, transition: transition as VideoClipItem["transition"] } : c
      )
    );
  };

  // style packs: declarative JSON recipes (caption preset / BGM / quality / CTA / product card).
  // Novice-safe "external skill": pure data validated against a whitelist — nothing executable.
  const packFileRef = useRef<HTMLInputElement>(null);
  const [packNotice, setPackNotice] = useState<string | null>(null);

  const applyStylePack = (pack: StylePack) => {
    const p = pack.compose;
    setConfig((c) => ({
      ...c,
      ...(p.captionPreset && { captionPreset: p.captionPreset }),
      ...(p.bgm && { bgm: p.bgm }),
      ...(p.bgmVolume !== undefined && { bgmVolume: p.bgmVolume }),
      ...(p.bgmDuck !== undefined && { bgmDuck: p.bgmDuck }),
      ...(p.quality && { renderPreset: p.quality, resolution: RENDER_PRESETS[p.quality].resolution }),
      ...(p.aspectRatio && { aspectRatio: p.aspectRatio }),
      ...(p.ctaText ? { ctaEnabled: true, ctaText: p.ctaText } : {}),
      ...(p.productCard !== undefined && { productCard: p.productCard }),
    }));
    setPackNotice(t("stylePackApplied").replace("{name}", pack.name));
  };

  // Ad-template hand-off (set at project creation on the new-project page): apply the
  // template's compose recipe ONCE per project, through the same whitelisted style-pack
  // path — later manual tweaks are never overwritten on revisit.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(adTemplateStorageKey(id));
      if (!stored || localStorage.getItem(adTemplateAppliedKey(id))) return;
      // decodes both builtin ids and inline AI custom templates (custom:<json>)
      const tpl = decodeStoredAdTemplate(stored);
      if (!tpl) return;
      applyStylePack({
        format: STYLE_PACK_FORMAT,
        name: tpl.name.en,
        compose: tpl.compose,
      });
      localStorage.setItem(adTemplateAppliedKey(id), "1");
    } catch {
      // localStorage unavailable — the pre-fill is a convenience, never a blocker
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const importStylePack = async (file: File) => {
    const pack = parseStylePack(await file.text());
    if (!pack) {
      setPackNotice(t("stylePackInvalid"));
      return;
    }
    applyStylePack(pack);
  };

  const exportStylePack = () => {
    const json = serializeStylePack({
      name: projectName || "my-style",
      compose: {
        captionPreset: config.captionPreset,
        bgm: config.bgm as StylePack["compose"]["bgm"],
        bgmVolume: config.bgmVolume,
        bgmDuck: config.bgmDuck,
        quality: config.renderPreset,
        aspectRatio: config.aspectRatio,
        ...(config.ctaEnabled && config.ctaText.trim() ? { ctaText: config.ctaText.trim() } : {}),
        productCard: config.productCard,
      },
    });
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "oryn-style-pack.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // —— Variant matrix: same assets,
  // hook copy × caption preset × BGM mood combos rendered as separate labeled outputs
  // for A/B testing. Zero extra AI-generation cost — only compose (FFmpeg + TTS) reruns. ——
  const [scriptShots, setScriptShots] = useState<Shot[]>([]);
  const [projectCategory, setProjectCategory] = useState("");
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [matrixHooks, setMatrixHooks] = useState<Set<string>>(new Set(["base"]));
  const [matrixCaptions, setMatrixCaptions] = useState<Set<string>>(new Set());
  const [matrixBgms, setMatrixBgms] = useState<Set<string>>(new Set());
  const [matrixRunning, setMatrixRunning] = useState(false);
  const [matrixResults, setMatrixResults] = useState<Array<{ label: string; status: "composing" | "done" | "failed"; url?: string }>>([]);

  /** Hard cap on one batch (compose is FFmpeg-heavy and runs sequentially). */
  const MATRIX_MAX = 6;
  const MATRIX_BGM_MOODS = ["upbeat", "chill", "energetic", "emotional"] as const;

  // hook-pattern categories use the script-engine vocabulary; map the project's UI category in
  const matrixCategory = (
    ["beauty", "food", "home", "fashion", "tech"].includes(projectCategory)
      ? projectCategory
      : projectCategory === "digital"
        ? "tech"
        : "home"
  ) as ProductCategory;

  // zero-LLM hook rewrites from the validated pattern library (base + 2 alternatives)
  const hookVariants = useMemo(
    () => (scriptShots.length > 0 ? buildHookVariants({ shots: scriptShots }, matrixCategory, 2) : []),
    [scriptShots, matrixCategory]
  );

  const matrixCombos = useMemo(() => {
    const hooks = [...matrixHooks];
    const captions = [...matrixCaptions];
    const bgms = [...matrixBgms];
    const combos: Array<{ hookKey: string; hookLabel: string; caption: string; bgm: string; label: string }> = [];
    for (const h of hooks) {
      const hookLabel = h === "base" ? t("matrixBaseHook") : hookVariants.find((v) => v.hookId === h)?.hookName ?? h;
      for (const c of captions) {
        for (const b of bgms) {
          combos.push({ hookKey: h, hookLabel, caption: c, bgm: b, label: `${hookLabel}×${c}×${b}` });
        }
      }
    }
    return combos.slice(0, MATRIX_MAX);
  }, [matrixHooks, matrixCaptions, matrixBgms, hookVariants, t]);

  const toggleMatrixOpen = () => {
    setMatrixOpen((open) => {
      // seed caption/BGM dimensions from the current config on first open
      if (!open) {
        setMatrixCaptions((s) => (s.size === 0 ? new Set([config.captionPreset]) : s));
        setMatrixBgms((s) => (s.size === 0 ? new Set([config.bgm !== "none" ? config.bgm : "upbeat"]) : s));
      }
      return !open;
    });
  };

  const toggleInSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  /** Run the matrix: sequential compose per combo, each polled by its own compositionId. */
  const runMatrix = async () => {
    if (matrixRunning || matrixCombos.length === 0) return;
    setMatrixRunning(true);
    setMatrixResults(matrixCombos.map((c) => ({ label: c.label, status: "composing" as const })));
    for (let i = 0; i < matrixCombos.length; i++) {
      const combo = matrixCombos[i];
      try {
        // hook variant: in-memory voiceover override for shot 1 (the stored script stays untouched)
        const variant = combo.hookKey === "base" ? undefined : hookVariants.find((v) => v.hookId === combo.hookKey);
        const hookShot = variant?.script.shots[0];
        const res = await fetch(`/api/project/${id}/compose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resolution: config.resolution,
            renderPreset: config.renderPreset,
            aspectRatio: config.aspectRatio,
            label: combo.label,
            ...(hookShot && { voiceoverOverrides: [{ shotId: hookShot.shotId, voiceover: hookShot.voiceover ?? "" }] }),
            ...(config.ctaEnabled && config.ctaText.trim() && { ctaText: config.ctaText.trim() }),
            ...(config.productCard && { productCard: true }),
            captionPreset: combo.caption,
            bgmVolume: config.bgmVolume,
            ...(config.bgmDuck && { bgmDuck: true }),
            ...(!config.voiceGround && { voiceGround: false }),
            // uploaded BGM stays fixed across combos; otherwise the mood dimension picks the free track
            ...(bgm?.path ? { bgmPath: bgm.path } : { freeBgm: true, bgmMood: combo.bgm }),
            ...(config.ttsEnabled && paidTtsReady && { ttsConfig: resolveTTSConfig(tts, providers) }),
            ...(config.ttsEnabled && !paidTtsReady && { freeTts: { enabled: true, voice: config.freeVoice } }),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.compositionId) throw new Error(data.error || "compose failed");
        // poll THIS composition by id (avoids the latest-row race across sequential renders)
        const url: string = await new Promise((resolve, reject) => {
          const poll = setInterval(async () => {
            try {
              const r = await fetch(`/api/project/${id}/compose?compositionId=${data.compositionId}`);
              const d = await r.json();
              const c = d.composition;
              if (!c) return;
              if (c.status === "done" && c.url) {
                clearInterval(poll);
                resolve(c.url);
              } else if (c.status === "failed") {
                clearInterval(poll);
                reject(new Error("failed"));
              }
            } catch {
              // transient poll failure — keep trying until the outer timeout
            }
          }, 3000);
          setTimeout(() => {
            clearInterval(poll);
            reject(new Error("timeout"));
          }, 300000);
        });
        setMatrixResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "done", url } : r)));
      } catch {
        setMatrixResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "failed" } : r)));
      }
    }
    setMatrixRunning(false);
  };

  // Real composition: call the compose API to run FFmpeg with an optimistic progress animation, then get the real mp4
  const startCompose = async () => {
    setIsComposing(true);
    setComposeError(null);
    setComposeDone(false);
    setOutputUrl(null);
    setComposeProgress(0);

    // Optimistic progress: climb to 90% first, reach 100% when the real result returns
    const timer = setInterval(() => {
      setComposeProgress((prev) => (prev >= 90 ? 90 : prev + 3));
    }, 200);

    try {
      // Submit the compose job (async in the background), then poll its status
      const res = await fetch(`/api/project/${id}/compose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution: config.resolution,
          renderPreset: config.renderPreset,
          aspectRatio: config.aspectRatio,
          ...(config.ctaEnabled && config.ctaText.trim() && { ctaText: config.ctaText.trim() }),
          ...(config.productCard && { productCard: true }),
          ...(config.captionPreset !== "standard" && { captionPreset: config.captionPreset }),
          bgmVolume: config.bgmVolume,
          ...(config.bgmDuck && { bgmDuck: true }),
          ...(bgm?.path && { bgmPath: bgm.path }),
          ...(!config.voiceGround && { voiceGround: false }),
          // no BGM uploaded and a non-none music mood selected → fetch a free CC track for that mood automatically
          ...(!bgm?.path && config.bgm !== "none" && { freeBgm: true, bgmMood: config.bgm }),
          // with voiceover on: use paid TTS if configured; otherwise free Edge keyless TTS (no key) generates a voice track per shot
          ...(config.ttsEnabled && paidTtsReady && {
            // resolved full config (platform, reused key, default baseUrl/model/voice, optional GroupId)
            ttsConfig: resolveTTSConfig(tts, providers),
          }),
          ...(config.ttsEnabled && !paidTtsReady && {
            freeTts: { enabled: true, voice: config.freeVoice },
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errorComposeFailed"));

      // Poll the compose status until done / failed (background job, avoids long-video request timeouts)
      const url: string = await new Promise((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const r = await fetch(`/api/project/${id}/compose`);
            const d = await r.json();
            const c = d.composition;
            if (!c) return;
            if (c.status === "done" && c.url) {
              clearInterval(poll);
              resolve(c.url);
            } else if (c.status === "failed") {
              clearInterval(poll);
              reject(new Error(t("errorComposeAssets")));
            }
          } catch {
            // ignore a single failed poll and keep retrying
          }
        }, 3000);
        // fallback timeout: 5 minutes
        setTimeout(() => {
          clearInterval(poll);
          reject(new Error(t("errorComposeTimeout")));
        }, 300000);
      });

      clearInterval(timer);
      setComposeProgress(100);
      setOutputUrl(url);
      setComposeDone(true);
    } catch (e) {
      clearInterval(timer);
      setComposeError(e instanceof Error ? e.message : t("errorComposeFailed"));
      setComposeProgress(0);
    } finally {
      setIsComposing(false);
    }
  };

  return (
    <div className="min-h-screen grid-bg">
      {/* project context strip: name + CLICKABLE step navigation — replaces the legacy
          inline non-clickable stepper this page carried while owned by a parallel session */}
      <ProjectHeader projectName={projectName || t("defaultProjectName")} />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* page-level load feedback: these states existed but were never rendered,
            leaving an empty timeline with no explanation */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <LuLoaderCircle className="h-4 w-4 animate-spin" />
            {t("stateLoading")}
          </div>
        )}
        {!loading && loadError && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Link href={`/project/${id}/assets`}>
              <Button variant="outline" size="sm">{t("backToAssets")}</Button>
            </Link>
          </div>
        )}
        <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${loading || loadError ? "hidden" : ""}`}>
          {/* Left: video timeline */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">{t("timelineTitle")}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{t("timelineMeta", { count: clips.length, duration: totalDuration })}</p>
              </div>
              <Link href={`/project/${id}/assets`}>
                <Button variant="outline" size="sm" className="text-xs">
                  <LuArrowLeft className="w-3.5 h-3.5 mr-1" />
                  {t("backToAssets")}
                </Button>
              </Link>
            </div>

            <div className="space-y-1">
              {clips.map((clip, index) => {
                const typeInfo = shotTypeLabels[clip.type];
                return (
                  <div key={clip.shotId}>
                    {/* Clip card */}
                    <Card className="glass-card">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          {/* Thumbnail: preview the generated visual if there is one, otherwise fall back to a placeholder */}
                          <div className="w-20 h-14 bg-muted/30 rounded-md shrink-0 overflow-hidden border border-border/30 relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                              <LuPlay className="w-4 h-4 text-primary/60" />
                            </div>
                            {thumbs[clip.shotId] &&
                              (isVideoPath(thumbs[clip.shotId]) ? (
                                <video
                                  src={thumbs[clip.shotId]}
                                  muted
                                  playsInline
                                  preload="metadata"
                                  className="absolute inset-0 w-full h-full object-cover"
                                />
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={thumbs[clip.shotId]}
                                  alt=""
                                  className="absolute inset-0 w-full h-full object-cover"
                                />
                              ))}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={`${typeInfo.color} border-0 text-[10px]`}>
                                {t(typeInfo.labelKey)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{clip.duration}s</span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              <LuMic className="mr-1 inline h-3 w-3 align-[-1px]" />{clip.voiceover}
                            </p>
                          </div>

                          {/* Index */}
                          <span className="text-sm font-bold text-muted-foreground/30 shrink-0">
                            {String(clip.shotId).padStart(2, "0")}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Transition selector (not shown after the last clip) */}
                    {index < clips.length - 1 && (
                      <div className="flex items-center justify-center py-1.5">
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/20 border border-border/30">
                          <LuChevronDown className="w-3 h-3 text-muted-foreground" />
                          <select
                            value={clip.transition}
                            onChange={(e) => updateTransition(clip.shotId, e.target.value)}
                            className="text-[11px] text-muted-foreground bg-transparent border-none outline-none cursor-pointer"
                          >
                            <option value="ai_start_end">{t(transitionLabels.ai_start_end)}</option>
                            <option value="ai_reference">{t(transitionLabels.ai_reference)}</option>
                            <option value="direct_concat">{t(transitionLabels.direct_concat)}</option>
                            <option value="ffmpeg_fade">{t(transitionLabels.ffmpeg_fade)}</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: compose settings */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-base font-semibold">{t("composeSettings")}</h2>

            {/* style packs: apply a whole look at once; import shared packs / export the current settings */}
            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                <Label className="text-sm font-medium">{t("stylePackLabel")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {BUILTIN_STYLE_PACKS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => applyStylePack(p)}
                      title={p.description}
                      className="h-9 rounded-md text-xs border border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40 hover:text-primary transition-all px-1 truncate"
                    >
                      {p.name.split(" / ")[0]}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => packFileRef.current?.click()}
                    className="h-8 rounded-md text-xs border border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40 transition-all"
                  >
                    {t("stylePackImport")}
                  </button>
                  <button
                    onClick={exportStylePack}
                    className="h-8 rounded-md text-xs border border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40 transition-all"
                  >
                    {t("stylePackExport")}
                  </button>
                </div>
                <input
                  ref={packFileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importStylePack(f);
                    e.target.value = ""; // allow re-importing the same file
                  }}
                />
                {packNotice && <p className="text-[11px] text-primary">{packNotice}</p>}
                <p className="text-[11px] text-muted-foreground">{t("stylePackHint")}</p>
              </CardContent>
            </Card>

            {/* Voiceover settings */}
            <Card className="glass-card">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{t("ttsLabel")}</Label>
                  {!paidTtsReady && (
                    <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium text-foreground">{t("ttsFreeBadge")}</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("ttsEnableLabel")}</span>
                  <button
                    onClick={() => setConfig((c) => ({ ...c, ttsEnabled: !c.ttsEnabled }))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${config.ttsEnabled ? "bg-primary" : "bg-muted"}`}
                  >
                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${config.ttsEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
                {config.ttsEnabled && paidTtsReady && (
                  <p className="text-[11px] text-muted-foreground">
                    {t("ttsPaidHint", { provider: getTTSProviderMeta(tts.provider).label })}
                  </p>
                )}
                {config.ttsEnabled && !paidTtsReady && (
                  <div className="space-y-2">
                    <Select value={config.freeVoice} onValueChange={(v) => setConfig((c) => ({ ...c, freeVoice: v ?? c.freeVoice }))}>
                      <SelectTrigger className="bg-muted/30 border-border/50 text-xs">
                        {/* Base UI's Select.Value shows the raw value by default; map it to a label with a function child */}
                        <SelectValue>
                          {(value: string) => {
                            const o = freeVoiceOptions.find((o) => o.value === value);
                            return o ? o.label : value;
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {freeVoiceOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={previewFreeVoice}
                      disabled={previewingVoice}
                      className="text-[11px] text-primary hover:underline disabled:opacity-50"
                    >
                      {previewingVoice ? t("ttsPreviewing") : t("ttsPreviewCta")}
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Background music */}
            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                <Label className="text-sm font-medium">{t("bgmSectionLabel")}</Label>
                <Select value={config.bgm} onValueChange={(v) => setConfig((c) => ({ ...c, bgm: v ?? c.bgm }))}>
                  <SelectTrigger className="bg-muted/30 border-border/50 text-xs">
                    {/* Base UI's Select.Value shows the raw value by default; map it to a label with a function child */}
                    <SelectValue>
                      {(value: string) => {
                        const o = bgmOptions.find((o) => o.value === value);
                        return o ? t(o.labelKey) : value;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {bgmOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {t(o.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t("bgmVolumeLabel")}</span>
                    <span className="tabular-nums">{Math.round(config.bgmVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={40}
                    step={1}
                    value={Math.round(config.bgmVolume * 100)}
                    onChange={(event) => setConfig((c) => ({ ...c, bgmVolume: Number(event.target.value) / 100 }))}
                    className="w-full accent-primary"
                    aria-label={t("bgmVolumeLabel")}
                  />
                </div>
                {/* Voiceover ducking: lower the BGM while the voiceover speaks and bring it back in pauses */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">{t("bgmDuckLabel")}</span>
                  <button
                    onClick={() => setConfig((c) => ({ ...c, bgmDuck: !c.bgmDuck }))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${config.bgmDuck ? "bg-primary" : "bg-muted"}`}
                  >
                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${config.bgmDuck ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
                {/* Voice grounding: TTS narration through a phone-mic band + AGC compression + room tone, avoiding the dry studio sound (native model voices skip this chain) */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">{t("voiceGroundLabel")}</span>
                  <button
                    onClick={() => setConfig((c) => ({ ...c, voiceGround: !c.voiceGround }))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${config.voiceGround ? "bg-primary" : "bg-muted"}`}
                  >
                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${config.voiceGround ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Caption settings */}
            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                <Label className="text-sm font-medium">{t("subtitleLabel")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["bottom", "center", "top"] as const).map((pos) => (
                    <button
                      key={pos}
                      onClick={() => setConfig((c) => ({ ...c, subtitlePosition: pos }))}
                      className={`h-9 rounded-md text-xs border transition-all ${
                        config.subtitlePosition === pos
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {pos === "bottom" ? t("subtitleBottom") : pos === "center" ? t("subtitleCenter") : t("subtitleTop")}
                    </button>
                  ))}
                </div>
                {/* caption style preset: standard boxed / bold punch / minimal / karaoke word-by-word */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">{t("captionStyleLabel")}</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(["standard", "bold", "minimal", "karaoke"] as const).map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setConfig((c) => ({ ...c, captionPreset: preset }))}
                        className={`h-9 rounded-md text-xs border transition-all ${
                          config.captionPreset === preset
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {t(`captionPreset_${preset}`)}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t(`captionPresetDesc_${config.captionPreset}`)}</p>
                </div>
              </CardContent>
            </Card>

            {/* Product conversion: purchase CTA end card */}
            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                <Label className="text-sm font-medium">{t("complianceLabel")}</Label>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("ctaLabel")}</span>
                  <button
                    onClick={() =>
                      setConfig((c) => {
                        const enabling = !c.ctaEnabled;
                        // when enabled with empty text, prefill with the placeholder to keep one-click convenience
                        return { ...c, ctaEnabled: enabling, ctaText: enabling && !c.ctaText.trim() ? t("ctaPlaceholder") : c.ctaText };
                      })
                    }
                    className={`relative w-10 h-5 rounded-full transition-colors ${config.ctaEnabled ? "bg-primary" : "bg-muted"}`}
                  >
                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${config.ctaEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
                {config.ctaEnabled && (
                  <Input
                    value={config.ctaText}
                    onChange={(e) => setConfig((c) => ({ ...c, ctaText: e.target.value }))}
                    placeholder={t("ctaPlaceholder")}
                    className="bg-muted/30 border-border/50 text-xs"
                  />
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("productCardLabel")}</span>
                  <button
                    onClick={() => setConfig((c) => ({ ...c, productCard: !c.productCard }))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${config.productCard ? "bg-primary" : "bg-muted"}`}
                  >
                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${config.productCard ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Visual settings */}
            <Card className="glass-card">
              <CardContent className="p-4 space-y-4">
                <Label className="text-sm font-medium">{t("canvasLabel")}</Label>
                {/* Render quality preset: fast/standard/HD (selecting syncs the resolution) */}
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground">{t("renderQualityLabel")}</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(["fast", "standard", "hd"] as const).map((preset) => (
                      <button
                        key={preset}
                        onClick={() =>
                          setConfig((c) => ({ ...c, renderPreset: preset, resolution: RENDER_PRESETS[preset].resolution }))
                        }
                        className={`flex flex-col items-center gap-0.5 rounded-md py-1.5 text-xs border transition-all ${
                          config.renderPreset === preset
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        <span className="font-medium">{t(`renderPreset_${preset}`)}</span>
                        <span className="text-[10px] opacity-70">{RENDER_PRESETS[preset].resolution}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t(`renderPresetDesc_${config.renderPreset}`)}</p>
                </div>
                {/* Aspect ratio */}
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground">{t("aspectRatioLabel")}</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(["9:16", "16:9", "1:1"] as const).map((ratio) => (
                      <button
                        key={ratio}
                        onClick={() => setConfig((c) => ({ ...c, aspectRatio: ratio }))}
                        className={`h-9 rounded-md text-xs border transition-all ${
                          config.aspectRatio === ratio
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {ratio === "9:16" ? t("aspectVertical") : ratio === "16:9" ? t("aspectHorizontal") : t("aspectSquare")}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Resolution */}
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground">{t("resolutionLabel")}</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(["720p", "1080p"] as const).map((res) => (
                      <button
                        key={res}
                        onClick={() => setConfig((c) => ({ ...c, resolution: res }))}
                        className={`h-9 rounded-md text-xs border transition-all ${
                          config.resolution === res
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Compose button */}
            <div className="space-y-3">
              {/* Background music (optional; mixed in and ducked under the voiceover) */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/10">
                <div className="min-w-0">
                  <p className="text-xs font-medium">{t("bgmOptionalTitle")}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{bgm ? t("bgmSelected", { name: bgm.name }) : t("bgmUploadHint")}</p>
                </div>
                <label className="shrink-0">
                  <input type="file" accept="audio/*" className="hidden" disabled={isComposing || bgmUploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBgm(f); e.target.value = ""; }} />
                  <span className={`inline-flex items-center h-8 px-3 rounded-md border border-border/60 text-xs cursor-pointer hover:border-primary/50 ${(isComposing || bgmUploading) ? "opacity-50 pointer-events-none" : ""}`}>
                    {bgmUploading ? t("bgmUploading") : bgm ? t("bgmReplace") : t("bgmUploadCta")}
                  </span>
                </label>
              </div>

              {/* Compose progress */}
              {(isComposing || composeDone) && (
                <div>
                  <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${composeDone ? "bg-emerald-500" : "brand-gradient"}`}
                      style={{ width: `${composeProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    {composeDone ? t("composeDoneMsg") : t("composingMsg", { progress: composeProgress })}
                  </p>
                </div>
              )}

              {/* Compose failure notice */}
              {composeError && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-xs text-destructive">{composeError}</p>
                </div>
              )}

              {/* Final video preview */}
              {composeDone && outputUrl && (
                <div className="rounded-lg overflow-hidden border border-border/50 bg-black">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video src={outputUrl} controls className="w-full max-h-[360px]" />
                </div>
              )}

              <Button
                onClick={startCompose}
                disabled={isComposing || clips.length === 0}
                className="w-full brand-gradient text-white"
              >
                {isComposing ? (
                  <>
                    <LuLoaderCircle className="animate-spin mr-2 h-4 w-4" />
                    {t("composing")}
                  </>
                ) : composeDone ? (
                  t("composeRedo")
                ) : (
                  <>
                    <LuPlay className="w-4 h-4 mr-1" />
                    {t("composeStart")}
                  </>
                )}
              </Button>

              {composeDone && outputUrl && (
                <>
                  <a href={`${outputUrl}?download=1`} download>
                    <Button variant="outline" className="w-full">{t("downloadVideo")}</Button>
                  </a>
                  <Link href={`/project/${id}/export`}>
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                      {t("nextExport")}
                      <LuArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </>
              )}

              {/* Variant matrix: hook × caption × BGM combos as
                  labeled outputs — same assets, compose-only reruns, zero AI-gen cost */}
              {clips.length > 0 && (
                <div className="rounded-lg border border-border/50 bg-muted/10 p-3 space-y-2">
                  <button
                    type="button"
                    onClick={toggleMatrixOpen}
                    className="w-full flex items-center justify-between text-sm font-medium"
                  >
                    <span>{t("matrixTitle")}</span>
                    <span className="text-xs text-muted-foreground">{matrixOpen ? "−" : "+"}</span>
                  </button>
                  {matrixOpen && (
                    <div className="space-y-3 text-xs pt-1">
                      <p className="text-muted-foreground leading-relaxed">{t("matrixDesc")}</p>
                      <div>
                        <p className="font-medium mb-1.5">{t("matrixHooks")}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {[{ key: "base", name: t("matrixBaseHook") }, ...hookVariants.map((v) => ({ key: v.hookId, name: v.hookName }))].map((h) => (
                            <button
                              key={h.key}
                              type="button"
                              onClick={() => toggleInSet(setMatrixHooks, h.key)}
                              className={`rounded-full border px-2 py-0.5 transition-all ${
                                matrixHooks.has(h.key)
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border/60 text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              {h.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="font-medium mb-1.5">{t("matrixCaptions")}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {CAPTION_PRESET_IDS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => toggleInSet(setMatrixCaptions, c)}
                              className={`rounded-full border px-2 py-0.5 transition-all ${
                                matrixCaptions.has(c)
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border/60 text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="font-medium mb-1.5">{t("matrixBgms")}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {MATRIX_BGM_MOODS.map((b) => (
                            <button
                              key={b}
                              type="button"
                              onClick={() => toggleInSet(setMatrixBgms, b)}
                              className={`rounded-full border px-2 py-0.5 transition-all ${
                                matrixBgms.has(b)
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border/60 text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              {b}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{t("matrixCount", { n: matrixCombos.length, max: MATRIX_MAX })}</span>
                        <Button
                          size="sm"
                          className="text-xs"
                          disabled={matrixRunning || matrixCombos.length === 0 || isComposing}
                          onClick={runMatrix}
                        >
                          {matrixRunning ? (
                            <>
                              <LuLoaderCircle className="animate-spin mr-1 h-3 w-3" />
                              {t("matrixRunning", {
                                done: matrixResults.filter((r) => r.status !== "composing").length,
                                total: matrixResults.length,
                              })}
                            </>
                          ) : (
                            t("matrixRun", { n: matrixCombos.length })
                          )}
                        </Button>
                      </div>
                      {matrixResults.length > 0 && (
                        <div className="space-y-1">
                          {matrixResults.map((r) => (
                            <div key={r.label} className="flex items-center gap-2 truncate">
                              {r.status === "composing" ? (
                                <LuLoaderCircle className="animate-spin h-3 w-3 shrink-0 text-muted-foreground" />
                              ) : r.status === "done" ? (
                                <LuCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              ) : (
                                <LuX className="h-3.5 w-3.5 text-destructive shrink-0" />
                              )}
                              <span className="truncate text-muted-foreground">{r.label}</span>
                              {r.url && (
                                <a href={r.url} target="_blank" rel="noreferrer" className="text-primary underline shrink-0">
                                  {t("matrixView")}
                                </a>
                              )}
                            </div>
                          ))}
                          <p className="text-[10px] text-muted-foreground pt-1">{t("matrixExportHint")}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
