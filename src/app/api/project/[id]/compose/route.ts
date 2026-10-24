import { NextRequest, NextResponse } from "next/server";
import { getDataDir, fileNameOf } from "@/lib/paths";
import { ffprobeBin, ffmpegBin } from "@/lib/ffmpeg-path";
import { join } from "path";
import { mkdirSync } from "fs";
import { renderFrameSequence } from "@/lib/video-composer/frame-sequence";
import { CAMERA_FRAME_PROMPT_PREFIX } from "@/lib/product-scene-prompt";
import { ensureCutSfx } from "@/lib/video-composer/sfx";
import { segmentBoundaries as cutBoundaries } from "@/lib/video-composer/timeline";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { generateSpeech, estimateSpeechSeconds, type TTSConfig } from "@/lib/tts";
import { stripPauseMarks } from "@/lib/voice-markup";
import { shotEmotion, EMOTION_TTS } from "@/lib/emotion-acting";
import { generateSpeechFreeDetailed, DEFAULT_FREE_VOICE, type TTSWord } from "@/lib/edge-tts";
import { resolveRenderProfile, isRenderPreset } from "@/lib/compose-presets";
import { isCaptionPreset, captionPresetOverrides, CAPTION_PRESETS } from "@/lib/caption-presets";
import { getDb } from "@/lib/db";
import { scripts as scriptsTable, assets as assetsTable, projects, compositions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { composeVideo, resolveSubtitleFontFamily, type ClipInput, type ComposeConfig } from "@/lib/video-composer/composer";
import { extractFirstFrame } from "@/lib/video-composer/frame-extract";
import { buildSubtitleTimeline, padDurationsForFade, segmentBoundaries, type TimelineSegment } from "@/lib/video-composer/timeline";
import { buildKaraokeAss } from "@/lib/video-composer/karaoke";
import { isAudibleFromVolumedetect } from "@/lib/video-composer/audio-probe";
import { buildComplianceOverlays } from "@/lib/compliance-overlays";
import { fetchFreeBgm, moodQueryForCategory, moodQueryForMood } from "@/lib/free-bgm";
import { resolveBgmMix } from "@/lib/audio-mix";
import { renderAudioStems } from "@/lib/audio-stems";
import type { Shot, ScriptCharacter } from "@/lib/db/schema";
import { assignCharacterVoices } from "@/lib/character-voices";
import { desc, and } from "drizzle-orm";

type ComposeRequestBody = {
  exportAudioStems?: boolean;
  voiceoverOverrides?: Array<{ shotId: number; voiceover: string }>;
  ttsConfig?: TTSConfig;
  freeTts?: { enabled?: boolean; voice?: string; rate?: string };
  renderPreset?: unknown;
  captionPreset?: unknown;
  resolution?: "720p" | "1080p" | string;
  aspectRatio?: "9:16" | "16:9" | "1:1" | string;
  aigcBadge?: boolean;
  label?: string;
  ctaText?: string;
  aigcBadgeText?: string;
  bgmPath?: string;
  freeBgm?: boolean;
  bgmMood?: string;
  bgmVolume?: number;
  bgmDuck?: boolean | "tight";
  voiceGround?: boolean;
  /** quick-cut internals (not user options): hook title card in the first second, synthetic hits on cuts */
  hookCard?: boolean;
  cutSfx?: boolean;
  karaoke?: boolean;
  productCard?: boolean;
  /** cross-fade every shot boundary that has no explicit transition (stock footage / stills); AI keyframe-chained shots keep their own */
  crossfade?: boolean;
  [key: string]: unknown;
};

// Get the project's latest composition record (the export page reads the real render)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    // optional ?compositionId: fetch one specific composition (A/B variants re-render sequentially and poll by id, avoiding the race where GET returns latest)
    const compositionId = req.nextUrl.searchParams.get("compositionId");
    const rows = compositionId
      ? await db
          .select()
          .from(compositions)
          .where(and(eq(compositions.projectId, id), eq(compositions.id, compositionId)))
          .limit(1)
      : await db
          .select()
          .from(compositions)
          .where(eq(compositions.projectId, id))
          .orderBy(desc(compositions.createdAt))
          .limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ composition: null });
    }
    const c = rows[0];
    // separator-agnostic: Windows rows store backslash absolute paths (issue #15)
    const fileName = fileNameOf(c.outputPath);
    const timelineUrl = fileName ? `/api/output/${id}/${encodeURIComponent(`${fileName}.timeline.json`)}` : null;
    return NextResponse.json({
      composition: {
        ...c,
        fileName,
        url: fileName ? `/api/output/${id}/${fileName}` : null,
        timelineUrl,
      },
    });
  } catch (error) {
    console.error("Failed to fetch composition record:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch composition record" },
      { status: 500 }
    );
  }
}

/** Map an /api/files/{pid}/{file} URL back to an absolute local disk path */
function toLocalPath(fileRef: string | undefined): string | undefined {
  if (!fileRef) return undefined;
  const m = fileRef.match(/\/api\/files\/(.+)/);
  if (!m) return undefined;
  const p = join(getDataDir(), "uploads", m[1]);
  return existsSync(p) ? p : undefined;
}

/** Assign a default camera move to product-photo shots by shot type */
function defaultMotion(shot: Shot): string {
  if (shot.motion) return shot.motion;
  switch (shot.type) {
    case "hook":
      return "zoom_in_slow";
    case "product_reveal":
      return "ken_burns";
    case "demo":
      return "pan_right";
    case "cta":
      return "static";
    default:
      return "ken_burns";
  }
}

// Compose video: read the selected script's shots + generated assets and render with FFmpeg, camera moves and captions
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsedBody = await req.json().catch(() => null);
    const body: ComposeRequestBody = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
      ? parsedBody as ComposeRequestBody
      : {};
    const exportAudioStems = body.exportAudioStems === true;
    const db = getDb();

    // load the project (product images as fallback) and the selected script
    const projRows = await db.select().from(projects).where(eq(projects.id, id));
    if (projRows.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const project = projRows[0];
    const productImages = (project.productImages ?? []) as string[];

    const scriptRows = await db.select().from(scriptsTable).where(eq(scriptsTable.projectId, id));
    const selected = scriptRows.find((s) => s.selected) ?? scriptRows[0];
    if (!selected || !Array.isArray(selected.shots) || selected.shots.length === 0) {
      return NextResponse.json({ error: "No script has been generated yet, so the video cannot be composed" }, { status: 400 });
    }
    let shots = selected.shots as Shot[];
    // Variant-matrix voiceover overrides for hook A/B: applied in memory
    // for this render only — the stored script stays untouched, so each variant compose can
    // carry a different hook copy without mutating the project.
    const voiceoverOverrides = body.voiceoverOverrides as Array<{ shotId: number; voiceover: string }> | undefined;
    if (Array.isArray(voiceoverOverrides) && voiceoverOverrides.length > 0) {
      const overrideByShot = new Map<number, string>();
      for (const o of voiceoverOverrides) {
        if (o && typeof o.shotId === "number" && typeof o.voiceover === "string") {
          overrideByShot.set(o.shotId, o.voiceover.trim().slice(0, 500));
        }
      }
      shots = shots.map((s) => {
        const v = overrideByShot.get(s.shotId);
        return v ? { ...s, voiceover: v } : s;
      });
    }
    // Dialogue-script cast (drama style): deterministic per-character Edge voices, free multi-voice
    // dialogue. Narrator shots (no characterId) keep the default/free voice below.
    const scriptCharacters = (selected.characters ?? []) as ScriptCharacter[];
    const characterVoices = assignCharacterVoices(scriptCharacters);
    if (characterVoices.size > 0) {
      console.info(
        `[compose] drama multi-voice: ${scriptCharacters.map((c) => `${c.name}→${characterVoices.get(c.id)}`).join(", ")}`
      );
    }

    // generated assets (assets table, indexed by shotId)
    const allAssetRows = await db.select().from(assetsTable).where(eq(assetsTable.projectId, id));
    const assetRows = allAssetRows.filter((a) => a.selected);
    const assetByShot = new Map<number, string>();
    // every selected still of a shot, oldest first: extra camera positions of the same scene are rendered as one moving clip
    const framesByShot = new Map<number, string[]>();
    const stockShots = new Set<number>();
    for (const a of assetRows) {
      if (a.filePath) assetByShot.set(a.shotId, a.filePath);
      if (a.type === "stock_footage") stockShots.add(a.shotId);
    }
    const byTime = (a: { createdAt?: unknown; id: string }, b: { createdAt?: unknown; id: string }) =>
      String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || a.id.localeCompare(b.id);
    for (const hero of assetRows) {
      if (!hero.filePath || hero.type !== "ai_generated") continue;
      const frames = allAssetRows
        .filter((a) => a.shotId === hero.shotId && !a.selected && a.type === "ai_generated" && !!a.filePath && (a.prompt ?? "").startsWith(CAMERA_FRAME_PROMPT_PREFIX) && byTime(a, hero) > 0)
        .sort(byTime)
        .map((a) => a.filePath as string);
      if (frames.length > 0) framesByShot.set(hero.shotId, [hero.filePath, ...frames]);
    }

    // optional TTS voiceover config (passed from the frontend settings)
    const ttsConfig: TTSConfig | undefined =
      body.ttsConfig?.baseUrl && body.ttsConfig?.apiKey && body.ttsConfig?.model && body.ttsConfig?.voice
        ? body.ttsConfig
        : undefined;
    // free voiceover fallback (Microsoft Edge keyless TTS, no key): lets one-sentence topic videos have sound without paid TTS
    const freeTts = body.freeTts as { enabled?: boolean; voice?: string; rate?: string } | undefined;
    const useFreeTts = !ttsConfig && freeTts?.enabled === true;
    const freeVoice = freeTts?.voice || DEFAULT_FREE_VOICE;
    const freeRate = typeof freeTts?.rate === "string" ? freeTts.rate : undefined;
    const ttsDir = join(getDataDir(), "uploads", id, "tts");
    if (ttsConfig || useFreeTts) await mkdir(ttsDir, { recursive: true });

    /** Detect whether a video has an audible track (native speech/SFX); silent/empty tracks don't count, so the free TTS voiceover still applies */
    async function videoHasAudio(filePath: string): Promise<boolean> {
      try {
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        // 1) check for an audio stream first
        const { stdout } = await execAsync(
          `"${ffprobeBin()}" -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${filePath}"`
        );
        if (stdout.trim().length === 0) return false;
        // 2) if present, use volumedetect to check for real sound (silent tracks count as no audio, so the TTS voiceover isn't swallowed)
        const { stderr } = await execAsync(
          `"${ffmpegBin()}" -i "${filePath}" -af volumedetect -f null -`
        );
        return isAudibleFromVolumedetect(stderr);
      } catch {
        return false;
      }
    }

    /** Probe media duration (seconds); returns 0 on failure */
    async function probeDuration(filePath: string): Promise<number> {
      try {
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        const { stdout } = await execAsync(
          `"${ffprobeBin()}" -v error -show_entries format=duration -of csv=p=0 "${filePath}"`
        );
        return parseFloat(stdout.trim()) || 0;
      } catch {
        return 0;
      }
    }

    // Structured degradation log for this render (in-memory for now; persisted into the
    // .timeline.json sidecar so tooling can surface which shots degraded and why)
    const composeWarnings: { code: "tts_fallback_free" | "tts_failed"; shotId: number }[] = [];

    /**
     * Generate a shot's voiceover as a local mp3; returns undefined on failure (doesn't block composition).
     * Returns { file, words }: words are word-level timestamps from the free Edge engine (for true karaoke sync); paid engines return no word data.
     * When paid TTS throws, fall back to free Edge (same text still speaks) and record a tts_fallback_free warning —
     * a mute shot is the harshest render defect, so the free fallback chain always beats silence.
     * characterVoice: the speaking character's own voice in drama scripts (free Edge path only — paid TTS config is
     * single-voice, so keep the narration voice to avoid switching mid-video).
     */
    async function buildVoiceover(
      shotId: number,
      text: string,
      characterVoice?: string,
      shotType?: string
    ): Promise<{ file: string; words?: TTSWord[] } | undefined> {
      if (!text || (!ttsConfig && !useFreeTts)) return undefined;
      const freeOpts = { voice: characterVoice || freeVoice, rate: freeRate };
      // per-shot expressive delivery for paid engines that support it (hook → eager,
      // pain_point → troubled, cta → confident); providers without the capability
      // silently ignore these fields inside generateSpeech
      const emo = shotType ? shotEmotion(shotType) : undefined;
      const expressive = emo ? { emotion: EMOTION_TTS[emo].emotion, instruction: EMOTION_TTS[emo].instruction } : {};
      try {
        // paid TTS first; otherwise free Edge keyless TTS (speed mapping: speed multiplier → signed SSML percentage)
        let audio: Buffer;
        let words: TTSWord[] | undefined;
        if (ttsConfig) {
          try {
            audio = await generateSpeech(text, { ...ttsConfig, ...expressive });
          } catch (e) {
            console.warn(`Shot ${shotId} paid voiceover failed, falling back to free Edge voiceover:`, e);
            composeWarnings.push({ code: "tts_fallback_free", shotId });
            const d = await generateSpeechFreeDetailed(text, freeOpts);
            audio = d.audio;
            words = d.words.length > 0 ? d.words : undefined;
          }
        } else {
          const d = await generateSpeechFreeDetailed(text, freeOpts);
          audio = d.audio;
          words = d.words.length > 0 ? d.words : undefined;
        }
        const file = join(ttsDir, `shot-${shotId}.mp3`);
        await writeFile(file, audio);
        return { file, words };
      } catch (e) {
        console.warn(`Shot ${shotId} voiceover generation failed (skipped):`, e);
        composeWarnings.push({ code: "tts_failed", shotId });
        return undefined;
      }
    }

    // cheap pre-check: at least one shot has a usable asset (avoids discovering missing assets after returning 202)
    const hasAnyAsset = shots.some((s) => toLocalPath(assetByShot.get(s.shotId) ?? productImages[0]));
    if (!hasAnyAsset) {
      return NextResponse.json(
        { error: "No usable assets. Generate assets in the assets step or upload product images first" },
        { status: 400 }
      );
    }

    // render quality preset (fast/standard/HD) → resolution + encoding params; only a valid preset overrides body.resolution,
    // otherwise an invalid preset string would silently bump the user's explicit 720p to 1080p.
    const validPreset = isRenderPreset(body.renderPreset) ? body.renderPreset : undefined;
    // caption style preset (standard/bold/minimal/karaoke); invalid values fall back to the default look
    const captionPresetRaw: unknown = body.captionPreset;
    const captionPreset = isCaptionPreset(captionPresetRaw) ? captionPresetRaw : undefined;
    const profile = resolveRenderProfile(validPreset);
    const resolution: "720p" | "1080p" = validPreset
      ? profile.resolution
      : body.resolution === "720p"
        ? "720p"
        : "1080p";
    const outputCfg = {
      resolution,
      aspectRatio: (typeof body.aspectRatio === "string" && ["9:16", "16:9", "1:1"].includes(body.aspectRatio) ? body.aspectRatio : "9:16") as "9:16" | "16:9" | "1:1",
      videoPreset: profile.videoPreset,
      crf: profile.crf,
    };

    // AIGC explicit badge (default ON): burned "AI-generated" corner label over the opening >=2s.
    // 2026-07 platform rules require a visible AI mark (AI-synthesized audio alone also counts);
    // opt out with body.aigcBadge=false — the release gate then reports the compliance risk.
    const aigcBadge = body.aigcBadge !== false;

    // Variant label (variant-matrix batch renders): surfaces on the export page's output list
    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 60) : undefined;

    // create the composition record (composing) and return immediately; heavy work (TTS+FFmpeg) runs async and the frontend polls GET
    const [comp] = await db
      .insert(compositions)
      .values({ projectId: id, resolution: outputCfg.resolution, aspectRatio: outputCfg.aspectRatio, aigcBadge, ...(label && { label }), status: "composing" })
      .returning();
    await db.update(projects).set({ status: "composing", updatedAt: new Date() }).where(eq(projects.id, id));

    // background async composition (doesn't block the request, avoids long-video timeouts)
    void (async () => {
     try {
    // Breathing gap in seconds between the end of one narration and the start of the next;
    // the extra tail needed by acrossfade transitions is added separately by padDurationsForFade
    const VOICE_GAP = 0.45;

    // build render shots: skip shots without assets; with TTS voiceover, time each shot to the real voiceover duration (captions/overlays/visuals aligned)
    const rendered: { shot: Shot; clip: ClipInput; duration: number; voiceSec?: number; words?: TTSWord[] }[] = [];
    const missing: number[] = [];
    for (const shot of shots) {
      // asset priority: the shot's generated asset → product photo fallback
      const ref = assetByShot.get(shot.shotId) ?? productImages[0];
      let local = toLocalPath(ref);
      if (!local) {
        missing.push(shot.shotId);
        continue;
      }
      // video vs still: when a generated video has its own audio, use the model's native voice and skip TTS (avoids double audio)
      // note: the free stock library (Wikimedia) also returns .ogv and similar containers — they must count as video, otherwise they're treated as stills → frozen frame + lost audio
      let isVideo = /\.(mp4|webm|mov|m4v|ogv|ogg|mkv|avi)$/i.test(local);
      // Broken-input gate: a video that ffprobe cannot time (truncated download, error page saved
      // as .mp4) would fail the whole single-pass filter_complex with an inscrutable error — swap
      // it for the product image instead of feeding it to ffmpeg, and log which shot degraded.
      if (isVideo && (await probeDuration(local)) <= 0) {
        const fallback = toLocalPath(productImages[0]);
        console.warn(`[compose] shot ${shot.shotId} video asset could not be decoded (${local}); fell back to the product image`);
        if (fallback && fallback !== local) {
          local = fallback;
          isVideo = /\.(mp4|webm|mov|m4v|ogv|ogg|mkv|avi)$/i.test(fallback);
        } else {
          missing.push(shot.shotId);
          continue;
        }
      }
      // Stock clips carry unrelated ambient/speech audio: never let it replace the script voiceover.
      const nativeAudio = isVideo && !stockShots.has(shot.shotId) ? await videoHasAudio(local) : false;
      const vo =
        shot.voiceover && !nativeAudio
          ? await buildVoiceover(shot.shotId, shot.voiceover, shot.characterId ? characterVoices.get(shot.characterId) : undefined, shot.type)
          : undefined;
      const audioPath = vo?.file;

      // Effective duration (core fix for issue #14 "next segment starts before speech ends"):
      // 1) TTS narration → actual audio length + breathing gap (clamped 1.5–20s); when the probe
      //    fails, estimate from text instead of falling back to the script's guessed duration,
      //    which used to hard-trim the narration mid-sentence;
      // 2) video with native voice → play out the real media length so model speech isn't cut;
      // 3) otherwise → script duration.
      let duration = shot.duration || 3;
      let voiceSec: number | undefined;
      // silent video clips also get probed: the composer speed-fits a moderately-too-long clip into
      // its slot (preserving a keyframe-chained ending) and needs the real source length for that
      let sourceDuration: number | undefined;
      if (audioPath) {
        const probed = await probeDuration(audioPath);
        voiceSec = probed > 0 ? probed : estimateSpeechSeconds(stripPauseMarks(shot.voiceover ?? ""));
        duration = Math.min(Math.max(voiceSec + VOICE_GAP, 1.5), 20);
        if (isVideo) {
          const mediaDur = await probeDuration(local);
          if (mediaDur > 0) sourceDuration = mediaDur;
        }
      } else if (nativeAudio) {
        const mediaDur = await probeDuration(local);
        if (mediaDur > 0) duration = Math.min(Math.max(mediaDur, 1.5), 20);
      } else if (isVideo) {
        const mediaDur = await probeDuration(local);
        if (mediaDur > 0) sourceDuration = mediaDur;
      }

      // several stills of this shot → pre-render them as one clip with eased camera moves and dissolves
      const frameRefs = !isVideo ? (framesByShot.get(shot.shotId) ?? []).map((f) => toLocalPath(f)).filter((f): f is string => !!f) : [];
      if (frameRefs.length >= 2 && frameRefs[0] === local) {
        try {
          const seqDir = join(getDataDir(), "output", id, "frames");
          mkdirSync(seqDir, { recursive: true });
          const w = resolution === "1080p" ? 1080 : 720;
          const ar = body.aspectRatio === "16:9" ? 16 / 9 : body.aspectRatio === "1:1" ? 1 : 9 / 16;
          const fw = ar >= 1 ? Math.round(w * ar) : w;
          const fh = ar >= 1 ? w : Math.round(w / ar);
          local = await renderFrameSequence({ frames: frameRefs.slice(0, 3), duration, width: fw, height: fh, outPath: join(seqDir, `shot-${shot.shotId}-${Date.now()}.mp4`) });
          isVideo = true;
          sourceDuration = duration;
        } catch (err) {
          console.warn(`[compose] frame sequence for shot ${shot.shotId} failed, using the first still:`, err instanceof Error ? err.message : err);
        }
      }

      const clip: ClipInput = {
        type: isVideo ? "video" : "image",
        filePath: local,
        duration,
        transition: body.crossfade === true && (!shot.transition || shot.transition === "ai_start_end" || shot.transition === "direct_concat") ? "ffmpeg_fade" : shot.transition || "ai_start_end",
        ...(isVideo ? { hasAudio: nativeAudio } : { motion: defaultMotion(shot) }),
        ...(sourceDuration && { sourceDuration }),
        ...(audioPath && { audioPath }),
      };
      rendered.push({ shot, clip, duration, voiceSec, ...(vo?.words ? { words: vo.words } : {}) });
    }

    if (rendered.length === 0) throw new Error("No usable assets");

    // acrossfade for ffmpeg_fade transitions consumes the previous clip's last FADE_DURATION:
    // pad voiced clips followed by a fade so the cross-fade only ever eats tail silence,
    // never the last words of narration (nor lets the next voice ride over them)
    const paddedDurations = padDurationsForFade(
      rendered.map((r) => ({
        duration: r.duration,
        transition: r.clip.transition,
        hasVoice: Boolean(r.clip.audioPath || r.clip.hasAudio),
      }))
    );
    rendered.forEach((r, i) => {
      r.duration = paddedDurations[i];
      r.clip.duration = paddedDurations[i];
    });

    const clips = rendered.map((r) => r.clip);

    // Subtitle + overlay timeline (pure functions in timeline.ts): accumulates the rendered
    // segments' effective durations in lockstep with the composer's xfade timeline; caption
    // cards follow the actual speech window (not the padded tail) and cards spilling across
    // fade transitions are clamped so two captions never over-print
    const timeline = buildSubtitleTimeline(
      rendered.map((r): TimelineSegment => {
        const ov = r.shot.textOverlay;
        return {
          duration: r.duration,
          transition: r.clip.transition,
          // captions must never show the [pause] breath marker
          voiceover: r.shot.voiceover ? stripPauseMarks(r.shot.voiceover) : undefined,
          voiceSec: r.voiceSec,
          // real word timestamps (free Edge TTS) → exact karaoke sync + word-snapped caption cards
          ...(r.words ? { words: r.words } : {}),
          overlay:
            ov && ov.style !== "subtitle" && ov.text
              ? { text: ov.text, style: ov.style as "title" | "highlight" | "price" }
              : undefined,
        };
      })
    );
    const subtitleTexts = timeline.cues;
    const karaokeLines = timeline.karaokeLines;
    const overlays: { text: string; style: "title" | "highlight" | "price" | "badge"; startTime: number; endTime: number }[] = [
      ...timeline.overlays,
    ];
    if (body.hookCard === true) {
      const hookLine = stripPauseMarks(rendered[0]?.shot.voiceover ?? "").split(/[.!?—]/)[0]?.trim();
      if (hookLine) overlays.push({ text: hookLine.length > 42 ? `${hookLine.slice(0, 40).trimEnd()}…` : hookLine, style: "title", startTime: 0, endTime: Math.min(1.4, rendered[0].duration) });
    }
    const cutSfxAt = body.cutSfx === true
      ? cutBoundaries(rendered.map((r) => ({ duration: r.duration, transition: r.clip.transition }))).filter((t) => t > 0.3 && t < timeline.total - 0.3)
      : [];
    const cutSfxPath = cutSfxAt.length > 0 ? await ensureCutSfx(join(getDataDir(), "output", id)).catch(() => null) : null;

    // optional overlays: opening AIGC compliance badge (default on) + end-card purchase CTA, toggled by body
    overlays.push(
      ...buildComplianceOverlays(
        {
          ctaText: typeof body.ctaText === "string" ? body.ctaText : undefined,
          aigcBadge,
          aigcBadgeText: typeof body.aigcBadgeText === "string" ? body.aigcBadgeText : undefined,
        },
        timeline.total
      )
    );

    // background music (optional): ① user-uploaded bgmPath; ② with freeBgm=true, fetch a free CC track automatically; mixed in and ducked
    let bgmLocal = body.bgmPath ? toLocalPath(body.bgmPath) : undefined;
    if (!bgmLocal && body.freeBgm === true) {
      // music mood: ① the bgmMood explicitly chosen on the video page wins; ② otherwise pick by product category (beauty→upbeat / food→warm…)
      const moodQuery =
        typeof body.bgmMood === "string" && body.bgmMood
          ? moodQueryForMood(body.bgmMood)
          : moodQueryForCategory(project.productCategory);
      const free = await fetchFreeBgm(id, moodQuery);
      if (free) {
        bgmLocal = free.localPath;
        // most CC music needs attribution: record the source for credits export / on-video attribution (CC BY etc.)
        console.info(`[bgm] free music: ${free.author} · ${free.license} · ${free.sourceUrl}`);
      }
    }

    const hasVoiceTrack = rendered.some((item) => Boolean(item.clip.audioPath || item.clip.hasAudio));
    const bgmMix = resolveBgmMix({ volume: body.bgmVolume, duck: body.bgmDuck, hasVoice: hasVoiceTrack });
    const config: ComposeConfig = {
      projectId: id,
      clips,
      output: {
        ...outputCfg,
        ...(bgmLocal && { bgmPath: bgmLocal, bgmVolume: bgmMix.volume, bgmDuck: bgmMix.duck ? (body.bgmDuck === "tight" ? ("tight" as const) : true) : false }),
        ...(cutSfxPath && { cutSfx: { path: cutSfxPath, at: cutSfxAt } }),
        // voice grounding (TTS de-broadcast + room-tone bed) defaults ON in the composer when a
        // TTS track exists; body.voiceGround === false is the explicit opt-out for a clean read
        ...(body.voiceGround === false && { voiceGround: false }),
      },
      subtitle:
        subtitleTexts.length > 0
          ? { texts: subtitleTexts, position: "bottom", ...captionPresetOverrides(captionPreset) }
          : undefined,
      overlays: overlays.length > 0 ? overlays : undefined,
    };

    // karaoke per-character subtitles (opt-in via the karaoke flag or captionPreset=karaoke):
    // whole-sentence ASS \k burn-in via libass, replacing the rapid short caption cards
    const wantKaraoke = body.karaoke === true || (captionPreset && CAPTION_PRESETS[captionPreset].karaoke === true);
    if (wantKaraoke && karaokeLines.length > 0) {
      const ass = buildKaraokeAss(karaokeLines, { fontName: resolveSubtitleFontFamily() });
      const assDir = join(getDataDir(), "output", id);
      await mkdir(assDir, { recursive: true });
      const assPath = join(assDir, `karaoke_${comp.id}.ass`);
      await writeFile(assPath, ass, "utf8");
      config.subtitle = { texts: [], karaokeAssPath: assPath };
    }

    // product card overlay (opt-in): first product image + product name as a bottom-left shop card
    if (body.productCard === true) {
      const cardImg = toLocalPath(productImages[0]);
      if (cardImg) {
        config.productCard = {
          imagePath: cardImg,
          name: (project.productName as string) || project.name || undefined,
          price: (project.productPrice as string) || undefined,
        };
      }
    }

        // run the composition (FFmpeg)
        const outputPath = await composeVideo(config);
        // Splice-point sidecar (same pattern as the BGM credit sidecar): the composer's actual
        // fade-aware segment boundaries. The smart contact sheet reads this as the authoritative
        // cut list — per-frame scene detection cannot see gradual cross-fades. Best-effort only.
        const boundaries = segmentBoundaries(rendered.map((r) => ({ duration: r.duration, transition: r.clip.transition })));
        const starts = [0, ...boundaries];
        const stemDirName = `stems_${comp.id}`;
        let renderedStems: { voicePath?: string; bgmPath?: string } = {};
        if (exportAudioStems) {
          try {
            renderedStems = await renderAudioStems({
              clips: rendered.map((r) => ({ duration: r.duration, transition: r.clip.transition, audioPath: r.clip.audioPath })),
              bgmPath: bgmLocal,
              bgmVolume: bgmMix.volume,
              totalDuration: timeline.total,
              outputDir: join(getDataDir(), "output", id, stemDirName),
            });
          } catch (error) {
            console.warn("Audio stem export failed (render not blocked):", error);
          }
        }
        const dialogueClips = rendered.flatMap((r, index) => r.clip.audioPath ? [{
          source: fileNameOf(r.clip.audioPath),
          start: Number((starts[index] ?? 0).toFixed(3)),
          end: Number(((starts[index] ?? 0) + r.duration).toFixed(3)),
        }] : []);
        const nativeClips = rendered.flatMap((r, index) => r.clip.hasAudio && r.clip.type === "video" ? [{
          source: fileNameOf(r.clip.filePath),
          start: Number((starts[index] ?? 0).toFixed(3)),
          end: Number(((starts[index] ?? 0) + r.duration).toFixed(3)),
        }] : []);
        const audioTracks = [
          ...(dialogueClips.length ? [{ id: "A1", role: "dialogue", clips: dialogueClips }] : []),
          ...(nativeClips.length ? [{ id: "A2", role: "native", clips: nativeClips }] : []),
          ...(bgmLocal ? [{ id: "A3", role: "bgm", source: fileNameOf(bgmLocal), start: 0, end: Number(timeline.total.toFixed(3)), volume: bgmMix.volume, duck: bgmMix.duck }] : []),
        ];
        await writeFile(
          `${outputPath}.timeline.json`,
          JSON.stringify({
            version: 1,
            boundaries,
            total: timeline.total,
            audioTracks,
            ...(exportAudioStems ? {
              audioStems: {
                voiceUrl: renderedStems.voicePath ? `/api/output/${id}/${stemDirName}/voice.wav` : null,
                bgmUrl: renderedStems.bgmPath ? `/api/output/${id}/${stemDirName}/bgm.wav` : null,
              },
            } : {}),
            // structured degradation log (TTS fallbacks / failed shots) — surfaced by tooling later
            ...(composeWarnings.length > 0 ? { warnings: composeWarnings } : {}),
          }),
          "utf8"
        ).catch(() => {});
        // cover thumbnail: grab the first frame next to the render (local, never expires) so the feed/project cards can show it; failures don't block
        const thumbnailPath = await extractFirstFrame(outputPath);
        // done: update the composition record and project status
        // Persist bgmPath as well: credits and the release gate both read compositions.bgmPath to
        // locate the BGM's .credit.json provenance sidecar, but nothing ever wrote the column, so
        // BGM licensing (free CC attribution included) never reached the manifest.
        await db
          .update(compositions)
          .set({ outputPath, status: "done", ...(thumbnailPath && { thumbnailPath }), ...(bgmLocal && { bgmPath: bgmLocal }) })
          .where(eq(compositions.id, comp.id));
        await db.update(projects).set({ status: "done", updatedAt: new Date() }).where(eq(projects.id, id));
      } catch (e) {
        console.error("Background composition failed:", e);
        await db.update(compositions).set({ status: "failed" }).where(eq(compositions.id, comp.id)).catch(() => {});
        await db.update(projects).set({ status: "video", updatedAt: new Date() }).where(eq(projects.id, id)).catch(() => {});
      }
    })();

    // return immediately; the frontend polls GET /api/project/[id]/compose until status=done/failed
    return NextResponse.json({ compositionId: comp.id, status: "composing" }, { status: 202 });
  } catch (error) {
    console.error("Video composition failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Video composition failed" },
      { status: 500 }
    );
  }
}
