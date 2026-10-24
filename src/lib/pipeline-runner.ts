/**
 * Server-side executor for the free hands-off chain (judge → stock-fill → compose).
 *
 * Until now this chain was a string of browser fetches inside the script page —
 * closing the tab killed the run halfway with only the final compose surviving
 * server-side. The runner moves orchestration into the server process and keeps a
 * persistent pipeline_runs record, so the page degrades to an observer: it can
 * re-attach after a refresh, and a failed/interrupted run resumes from its
 * recorded stage.
 *
 * Stage semantics mirror the page chain exactly (quality bar unchanged):
 * - judge: best-effort quality pass, tier-gated auto-apply (invariant/default only);
 *   missing LLM config or a failed pass skips silently.
 * - stock_fill: best-effort free footage matching; failure is non-fatal.
 * - compose: the only fatal stage — free Edge TTS render, polled to completion.
 *
 * Stages are re-invoked through the existing HTTP routes (self-fetch against this
 * server's own origin) instead of duplicating their internals — identical behavior,
 * one implementation.
 */

import { getDb } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { assets, compositions, pipelineRuns } from "@/lib/db/schema";
import { createProvider } from "@/lib/providers";
import { toRemoteUsableImage } from "@/lib/remote-image";
import { persistAssetSource, saveAssetCandidate } from "@/lib/asset-persistence";
import { toEditVariant } from "@/lib/gen-params";
import { buildProductScenePrompt, buildCameraFramePrompt } from "@/lib/product-scene-prompt";
import { createLLMClient } from "@/lib/llm-error";
import {
  autoApplicableRewrites,
  autoApplicableDescriptionRewrites,
  type JudgeReport,
} from "@/lib/script-judge";
import { stagesFrom, type PipelineStage } from "@/lib/pipeline-stages";

export interface PipelineLlmConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

/** Image model + the enabled provider keys the browser holds; the runner resolves which provider serves the model. */
export type PipelineProfile = "quick" | "cinematic";

export interface PipelineImageConfig {
  model: string;
  providers: Array<{ name: string; apiKey: string; baseUrl?: string }>;
}

export interface StartPipelineInput {
  projectId: string;
  /** script variant to lock in as selected before the chain runs */
  scriptId?: string;
  /** this server's own origin (from the incoming request) — target of stage self-fetches */
  origin: string;
  /** optional LLM config: enables the judge pass + semantic footage rerank */
  llmConfig?: PipelineLlmConfig;
  /** optional image model: product-specific AI scenes (image-to-image from the product photo) before stock fill */
  imageConfig?: PipelineImageConfig;
  /** "quick" (default): one scene per shot, fast; "cinematic": candidates + camera frames + ad-grade mix */
  profile?: PipelineProfile;
  /** resume breakpoint; defaults to the full chain */
  fromStage?: PipelineStage;
}

// Survives route-module reloads in dev: one registry of run ids currently executing in THIS
// process. A DB row saying "running" whose id is absent here means the server restarted
// mid-run — the row is an orphan and gets surfaced as interrupted.
const globalRuns = globalThis as unknown as { __orynActivePipelines?: Set<string> };
const activeRuns = (globalRuns.__orynActivePipelines ??= new Set<string>());

export function isPipelineRunActive(runId: string): boolean {
  return activeRuns.has(runId);
}

/** Compose polling budget: 2.5s × 288 ≈ 12 min, above the server render timeout. */
const COMPOSE_POLL_INTERVAL_MS = 2500;
const COMPOSE_POLL_MAX = 288;

async function setRun(runId: string, patch: Partial<typeof pipelineRuns.$inferInsert>): Promise<void> {
  const db = getDb();
  await db.update(pipelineRuns).set({ ...patch, updatedAt: new Date() }).where(eq(pipelineRuns.id, runId));
}

/** Judge stage: run the panel and auto-apply tier-gated rewrites. Best-effort by contract. */
async function runJudgeStage(input: StartPipelineInput): Promise<void> {
  if (!input.llmConfig?.baseUrl || !input.llmConfig.model || !input.scriptId) return;
  try {
    const res = await fetch(`${input.origin}/api/project/${input.projectId}/script-judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scriptId: input.scriptId, llmConfig: input.llmConfig }),
    });
    if (!res.ok) return;
    const report = (await res.json()) as JudgeReport;
    const patchByShot = new Map<number, { shotId: number; voiceover?: string; description?: string }>();
    for (const r of autoApplicableRewrites(report)) patchByShot.set(r.shotId, { shotId: r.shotId, voiceover: r.voiceover });
    for (const r of autoApplicableDescriptionRewrites(report)) {
      patchByShot.set(r.shotId, { ...(patchByShot.get(r.shotId) ?? { shotId: r.shotId }), description: r.description });
    }
    if (patchByShot.size === 0) return;
    await fetch(`${input.origin}/api/project/${input.projectId}/scripts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scriptId: input.scriptId, shotTexts: Array.from(patchByShot.values()) }),
    });
  } catch {
    /* quality is best-effort — never a new failure mode for the chain */
  }
}

/** Shots whose visuals should be built around the merchant's product rather than generic footage. */
const AI_SCENE_CONCURRENCY = 2;
const AI_SCENE_SIZE = { width: 1024, height: 1536 } as const;
/** quick-cut only: top quality and strict likeness to the merchant's photo (other image paths keep their own params) */
function sceneExtra(modelId: string): Record<string, string> {
  // input_fidelity exists on gpt-image-1.x only; gpt-image-2 rejects the parameter outright
  return /gpt-image-1/i.test(modelId) ? { quality: "high", input_fidelity: "high" } : { quality: "high" };
}
/** extra camera positions generated per scene for in-shot motion */
const AI_SCENE_CAMERA_FRAMES = 2;

type PipelineShot = { shotId: number; type?: string; description?: string; voiceover?: string };

async function resolveImageProvider(cfg: PipelineImageConfig): Promise<{ name: string; apiKey: string; baseUrl?: string } | null> {
  const withKeys = cfg.providers.filter((p) => p.apiKey);
  if (withKeys.length === 0) return null;
  if (withKeys.length === 1) return withKeys[0];
  for (const p of withKeys) {
    try {
      const provider = createProvider({ name: p.name, apiKey: p.apiKey, baseUrl: p.baseUrl ?? "", timeout: 10_000 });
      const models = await Promise.race([
        provider.listModels("image"),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("CATALOG_TIMEOUT")), 12_000)),
      ]);
      if (models.some((m) => m.id === cfg.model)) return p;
    } catch {
      /* try the next provider */
    }
  }
  return null;
}

/**
 * AI-scenes stage: when an image model is configured, render every shot that has no asset yet as a
 * product-specific scene — image-to-image from the merchant's product photo so the exact product
 * appears in each setting the script describes. Shots that fail fall through to stock-fill. Non-fatal.
 */
async function runAiScenesStage(input: StartPipelineInput): Promise<void> {
  const cfg = input.imageConfig;
  if (!cfg?.model || cfg.providers.length === 0) return;
  try {
    const target = await resolveImageProvider(cfg);
    if (!target) return;
    const [projectRes, scriptsRes] = await Promise.all([
      fetch(`${input.origin}/api/project/${input.projectId}`),
      fetch(`${input.origin}/api/project/${input.projectId}/scripts`),
    ]);
    if (!projectRes.ok || !scriptsRes.ok) return;
    const project = (await projectRes.json()) as { productImages?: string[] };
    const rows = (await scriptsRes.json()) as Array<{ id: string; shots?: PipelineShot[] }>;
    const script = (input.scriptId && rows.find((r) => r.id === input.scriptId)) || rows[0];
    const shots = (script?.shots ?? []).filter((s) => typeof s.shotId === "number");
    if (shots.length === 0) return;

    const db = getDb();
    const covered = new Set(
      db.select({ shotId: assets.shotId }).from(assets)
        .where(and(eq(assets.projectId, input.projectId), eq(assets.selected, true))).all()
        .map((r) => r.shotId)
    );
    const pending = shots.filter((s) => !covered.has(s.shotId));
    if (pending.length === 0) return;

    const productPhoto = project.productImages?.[0];
    const referenceImageUrl = productPhoto ? await toRemoteUsableImage(productPhoto) : undefined;
    const modelId = referenceImageUrl ? toEditVariant(cfg.model) : cfg.model;
    const provider = createProvider({ name: target.name, apiKey: target.apiKey, baseUrl: target.baseUrl ?? "" });

    const byId = new Map(shots.map((s) => [s.shotId, s]));
    const describe = (s?: PipelineShot) => (s ? s.description || s.voiceover || "" : "");
    const pickBetter = async (shot: PipelineShot, description: string, candidates: string[]): Promise<number> => {
      if (candidates.length < 2 || !input.llmConfig?.baseUrl || !input.llmConfig.model) return 0;
      try {
        const client = createLLMClient({ baseUrl: input.llmConfig.baseUrl, apiKey: input.llmConfig.apiKey ?? "" });
        const res = await client.chat.completions.create({
          model: input.llmConfig.model,
          max_tokens: 20,
          temperature: 0,
          messages: [
            { role: "system", content: "You are a commercial director choosing the better frame for a product ad. Answer with a single digit only." },
            {
              role: "user",
              content: [
                { type: "text", text: `Shot type: ${shot.type ?? "demo"}. Intended scene: ${description}. Which image better matches the scene, keeps the product identical to a real product photo, looks like a premium commercial, and contains no text or artifacts? Answer 1 or 2.` },
                { type: "image_url", image_url: { url: candidates[0], detail: "low" } },
                { type: "image_url", image_url: { url: candidates[1], detail: "low" } },
              ],
            },
          ],
        });
        const answer = res.choices[0]?.message?.content?.trim() ?? "";
        return answer.startsWith("2") ? 1 : 0;
      } catch (err) {
        console.warn(`[pipeline] candidate pick failed for shot ${shot.shotId}, using the first:`, err instanceof Error ? err.message : err);
        return 0;
      }
    };
    const cinematic = input.profile === "cinematic";
    const renderShot = async (shot: PipelineShot) => {
      const description = describe(shot);
      if (!description) return;
      const previous = cinematic ? describe(byId.get(shot.shotId - 1)) : undefined;
      const prompt = buildProductScenePrompt(description, !!referenceImageUrl, shot.type, { previous, notes: cinematic });
      try {
        const result = await provider.generateImage({
          modelId,
          mode: referenceImageUrl ? "image-to-image" : "text-to-image",
          prompt,
          count: cinematic ? 2 : 1,
          width: AI_SCENE_SIZE.width,
          height: AI_SCENE_SIZE.height,
          ...(referenceImageUrl ? { referenceImageUrl } : {}),
          ...(cinematic ? { extra: sceneExtra(modelId) } : {}),
        });
        const candidates = result.imageUrls ?? [];
        if (candidates.length === 0) throw new Error("no image returned");
        const chosen = candidates[await pickBetter(shot, description, candidates)];
        const filePath = await persistAssetSource(input.projectId, chosen, shot.shotId);
        await saveAssetCandidate({
          projectId: input.projectId,
          shotId: shot.shotId,
          filePath,
          type: "ai_generated",
          provider: target.name,
          model: modelId,
          prompt,
        });
        // extra camera positions of the same scene: the composer moves between them so the shot reads as footage
        const sceneRef = await toRemoteUsableImage(filePath);
        for (let f = 0; f < (cinematic ? AI_SCENE_CAMERA_FRAMES : 0); f++) {
          try {
            const frame = await provider.generateImage({
              modelId: toEditVariant(cfg.model),
              mode: "image-to-image",
              prompt: buildCameraFramePrompt(f),
              count: 1,
              width: AI_SCENE_SIZE.width,
              height: AI_SCENE_SIZE.height,
              referenceImageUrl: sceneRef,
              extra: sceneExtra(modelId),
            });
            const url = frame.imageUrls?.[0];
            if (!url) continue;
            const framePath = await persistAssetSource(input.projectId, url, shot.shotId, "frame");
            await saveAssetCandidate({ projectId: input.projectId, shotId: shot.shotId, filePath: framePath, type: "ai_generated", provider: target.name, model: modelId, prompt: buildCameraFramePrompt(f) });
          } catch (err) {
            console.warn(`[pipeline] camera frame ${f + 1} failed for shot ${shot.shotId}:`, err instanceof Error ? err.message : err);
          }
        }
        // saving a candidate deselects the shot's earlier assets: the hero stays the selected still, frames ride along
        db.update(assets).set({ selected: false }).where(and(eq(assets.projectId, input.projectId), eq(assets.shotId, shot.shotId))).run();
        db.update(assets).set({ selected: true }).where(and(eq(assets.projectId, input.projectId), eq(assets.shotId, shot.shotId), eq(assets.filePath, filePath))).run();
      } catch (err) {
        console.warn(`[pipeline] ai scene failed for shot ${shot.shotId}:`, err instanceof Error ? err.message : err);
        // the merchant's own photo (with motion at compose time) beats unrelated stock for a product ad
        if (!productPhoto) return;
        try {
          const filePath = await persistAssetSource(input.projectId, `${input.origin}${productPhoto}`, shot.shotId, "product");
          await saveAssetCandidate({ projectId: input.projectId, shotId: shot.shotId, filePath, type: "product_image" });
        } catch (fallbackErr) {
          console.warn(`[pipeline] product-photo fallback failed for shot ${shot.shotId}:`, fallbackErr instanceof Error ? fallbackErr.message : fallbackErr);
        }
      }
    };
    for (let i = 0; i < pending.length; i += AI_SCENE_CONCURRENCY) {
      await Promise.all(pending.slice(i, i + AI_SCENE_CONCURRENCY).map(renderShot));
    }
  } catch (err) {
    console.warn("[pipeline] ai scenes stage skipped:", err instanceof Error ? err.message : err);
  }
}

/** Stock-fill stage: free footage matching, optional semantic rerank. Non-fatal. */
async function runStockFillStage(input: StartPipelineInput): Promise<void> {
  try {
    await fetch(`${input.origin}/api/project/${input.projectId}/stock-fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "all",
        mediaType: "auto",
        ...(input.llmConfig?.baseUrl && input.llmConfig.model ? { llmConfig: input.llmConfig } : {}),
      }),
    });
  } catch {
    /* non-fatal: product images/assets may already cover the shots */
  }
}

/**
 * Compose settings for the one-click quick cut. Mirrors the "Commerce Punch" style pack the Video
 * page offers (bold captions, upbeat ducked music, product card) plus cross-fades between shots, so the
 * hands-off path produces an ad-grade cut instead of hard cuts over silence.
 */
export const QUICK_CUT_COMPOSE_BODY = {
  freeTts: { enabled: true },
  captionPreset: "bold",
  freeBgm: true,
  bgmMood: "upbeat",
  bgmDuck: true,
  productCard: true,
  crossfade: true,
} as const;

/** cinematic ad: same free voice, tighter duck under it, hook title card and synthetic hits on cuts */
export const CINEMATIC_COMPOSE_BODY = {
  ...QUICK_CUT_COMPOSE_BODY,
  bgmDuck: "tight",
  hookCard: true,
  cutSfx: true,
} as const;

/** Compose stage: free Edge TTS render, polled to a terminal status. The only fatal stage. */
async function runComposeStage(input: StartPipelineInput, runId: string): Promise<void> {
  const res = await fetch(`${input.origin}/api/project/${input.projectId}/compose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.profile === "cinematic" ? CINEMATIC_COMPOSE_BODY : QUICK_CUT_COMPOSE_BODY),
  });
  const data = (await res.json().catch(() => ({}))) as { compositionId?: string; error?: string };
  if (!res.ok) throw new Error(data.error || "Compose failed to start");
  const compositionId = data.compositionId;
  if (compositionId) await setRun(runId, { compositionId });

  const db = getDb();
  for (let i = 0; i < COMPOSE_POLL_MAX; i++) {
    await new Promise((r) => setTimeout(r, COMPOSE_POLL_INTERVAL_MS));
    const rows = compositionId
      ? await db.select().from(compositions).where(eq(compositions.id, compositionId)).limit(1)
      : [];
    const st = rows[0]?.status;
    if (st === "done") return;
    if (st === "failed") throw new Error("Video composition failed");
  }
  throw new Error("Composition timed out");
}

/**
 * Insert a run row and execute the chain in the background. Returns the run id
 * immediately (the route responds 202; pages poll GET for progress).
 */
export async function startPipelineRun(input: StartPipelineInput): Promise<string> {
  const db = getDb();
  const stages = stagesFrom(input.fromStage);
  const [run] = await db
    .insert(pipelineRuns)
    .values({ projectId: input.projectId, scriptId: input.scriptId ?? null, stage: stages[0], status: "running" })
    .returning();
  activeRuns.add(run.id);

  void (async () => {
    try {
      // lock in the chosen variant so every stage (and compose) uses it
      if (input.scriptId) {
        await fetch(`${input.origin}/api/project/${input.projectId}/scripts`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedScriptId: input.scriptId }),
        }).catch(() => {});
      }
      for (const stage of stages) {
        await setRun(run.id, { stage });
        if (stage === "judge") await runJudgeStage(input);
        else if (stage === "ai_scenes") await runAiScenesStage(input);
        else if (stage === "stock_fill") await runStockFillStage(input);
        else await runComposeStage(input, run.id);
      }
      await setRun(run.id, { status: "done" });
    } catch (e) {
      console.error(`[pipeline] run failed run=${run.id}:`, e);
      await setRun(run.id, { status: "failed", error: e instanceof Error ? e.message : String(e) }).catch(() => {});
    } finally {
      activeRuns.delete(run.id);
    }
  })();

  return run.id;
}
