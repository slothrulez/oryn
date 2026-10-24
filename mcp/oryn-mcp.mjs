#!/usr/bin/env node
/**
 * Oryn MCP Server — exposes Oryn's "one-sentence-to-video" pipeline as MCP tools,
 * allowing any MCP client (Claude Desktop / Claude Code / Cursor, etc.) to drive video generation directly.
 *
 * Design: this service is a thin wrapper around the Oryn HTTP API (reusing all its orchestration:
 * DB / FFmpeg / free TTS / free stock), communicating with the client via stdio.
 * Only "generate script" requires an LLM Key; Openverse stock + Edge TTS are fully key-free.
 *
 * Environment variables:
 *   ORYN_BASE_URL     Oryn instance URL (default http://localhost:3000; run `pnpm dev` / `pnpm start` first)
 *   ORYN_LLM_BASE_URL LLM endpoint (OpenAI-compatible, e.g. https://api.atlascloud.ai/v1)
 *   ORYN_LLM_API_KEY  LLM key (required for script generation; omitting it gives a clear prompt in create_video / generate_script)
 *   ORYN_LLM_MODEL    LLM model name (e.g. gpt-4o-mini)
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = (process.env.ORYN_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const LLM = {
  baseUrl: process.env.ORYN_LLM_BASE_URL || "",
  apiKey: process.env.ORYN_LLM_API_KEY || "",
  model: process.env.ORYN_LLM_MODEL || "",
};

// Free stock source keys (optional): when provided, adds high-quality Pexels/Pixabay video; without them, keyless Wikimedia video + Openverse images are still available
const STOCK_KEYS = {};
if (process.env.ORYN_PIXABAY_KEY) STOCK_KEYS.pixabay = process.env.ORYN_PIXABAY_KEY;
if (process.env.ORYN_PEXELS_KEY) STOCK_KEYS.pexels = process.env.ORYN_PEXELS_KEY;

const NARRATION_STYLES = ["knowledge", "story", "lifestyle", "inspiration", "travel"];
const FOOTAGE_KINDS = ["auto", "image", "video"];
const ASPECT_RATIOS = ["9:16", "16:9", "1:1"]; // 9:16 portrait (Reels/Shorts) · 16:9 landscape · 1:1 square
const QUALITY_PRESETS = ["fast", "standard", "hd"]; // maps to real FFmpeg encoding: resolution + x264 preset + crf
const CAPTION_PRESETS = ["standard", "bold", "minimal", "karaoke"]; // caption style presets (mirrors src/lib/caption-presets.ts)

/** footage resolution: default "auto" — delegates to stock-fill per shot ("video first, fall back to image" — fully key-free); image/video are explicit overrides */
function resolveMediaType(footage) {
  return FOOTAGE_KINDS.includes(footage) ? footage : "auto";
}

/** Build the compose request body from tool args: free TTS (optional voice) + aspect ratio + quality preset */
function composeBody(args) {
  const body = { freeTts: { enabled: true } };
  if (typeof args.voice === "string" && args.voice) body.freeTts.voice = args.voice;
  if (ASPECT_RATIOS.includes(args.aspectRatio)) body.aspectRatio = args.aspectRatio;
  if (QUALITY_PRESETS.includes(args.quality)) body.renderPreset = args.quality;
  if (args.bgm === true) body.freeBgm = true; // automatically add a free CC background music track
  if (["upbeat", "chill", "energetic", "emotional"].includes(args.bgmMood)) body.bgmMood = args.bgmMood; // BGM mood
  if (Number.isFinite(args.bgmVolume) && args.bgmVolume >= 0.05 && args.bgmVolume <= 0.4) body.bgmVolume = Math.round(args.bgmVolume * 100) / 100; // normalized 0.05-0.4 mix level
  if (args.audioStems === true) body.exportAudioStems = true; // render editable voice/BGM WAV stems after the main composition
  if (args.bgmDuck === true) body.bgmDuck = true; // voiceover ducking (makes narration clearer)
  if (args.karaoke === true) body.karaoke = true; // karaoke word-by-word captions
  if (CAPTION_PRESETS.includes(args.captionPreset)) body.captionPreset = args.captionPreset; // caption style preset
  if (args.productCard === true) body.productCard = true; // product card overlay (only applies when product image exists)
  if (args.aiDisclosure === false) body.aigcBadge = false; // opt OUT of the default-on visible AIGC badge
  if (typeof args.ctaText === "string" && args.ctaText.trim()) body.ctaText = args.ctaText.trim(); // end-card purchase CTA
  return body;
}

/** Default free voice when none is specified: native English. */
export function defaultVoiceForTopic() {
  return "en-US-AvaNeural";
}

/** Shared "output options" JSON-Schema properties for create_video / compose */
const OUTPUT_OPTION_PROPS = {
  voice: { type: "string", description: "Edge TTS voice value (e.g. en-US-AvaNeural; must come from oryn_list_voices — guessed IDs fail to synthesize). Defaults to en-US-AriaNeural when omitted" },
  aspectRatio: { type: "string", enum: ASPECT_RATIOS, description: "Aspect ratio, default 9:16 vertical" },
  quality: { type: "string", enum: QUALITY_PRESETS, description: "Quality preset fast/standard/hd, default standard" },
  bgm: {
    type: "boolean",
    description: "Automatically add a free CC background track (Openverse, keyless; mixed under the voiceover and ducked automatically). Most CC music requires attribution. Default false",
  },
  karaoke: {
    type: "boolean",
    description: "Karaoke word-by-word highlighted captions (the whole line stays on screen and each word changes color with the voiceover). Default false (the default is rapid short-phrase captions)",
  },
  captionPreset: {
    type: "string",
    enum: CAPTION_PRESETS,
    description:
      "Caption style preset: standard white text on a translucent box (default) / bold large heavy outline, no box (high-retention style) / minimal small thin outline (clean documentary look) / karaoke word-by-word highlight (same as karaoke=true)",
  },
  productCard: {
    type: "boolean",
    description: "Product card overlay (bottom-left product thumbnail + name + price + buy prompt). Only applies to product projects with a product image; ignored for topic videos. Default false",
  },
  bgmMood: {
    type: "string",
    enum: ["upbeat", "chill", "energetic", "emotional"],
    description: "Mood of the free BGM (requires bgm=true): upbeat / chill / energetic / emotional. Omit to pick automatically by product category",
  },
  bgmDuck: {
    type: "boolean",
    description: "Voiceover ducking: lowers the BGM while the voiceover speaks and brings it back up in pauses, for clearer narration (requires BGM). Default false",
  },
  bgmVolume: {
    type: "number",
    minimum: 0.05,
    maximum: 0.4,
    description: "Background music mix level, 0.05-0.4 (default 0.18); still ducks automatically under the voiceover",
  },
  audioStems: {
    type: "boolean",
    description: "Also export editable voiceover and BGM WAV stems; when done, read the download URLs from audioStems in the composition.timelineUrl sidecar. Default false (adds one extra audio render)",
  },
  aiDisclosure: {
    type: "boolean",
    description:
      "Visible \"AI-generated\" badge (top-left for at least 2 seconds at the start; platforms increasingly require disclosure even for AI voiceover only). Default true (burned in); set false to disable — the publish gate will warn about reach-limiting risk. Hidden AI-content file metadata is always written regardless of this switch",
  },
  ctaText: {
    type: "string",
    description: "End-card call-to-action text (e.g. \"👇 Tap the link below to shop\"); omit for no end-card CTA",
  },
};

/** Shared projectId schema property — most tools operate on an existing project */
const PROJECT_ID_PROP = {
  type: "string",
  description: "Project ID (from oryn_list_projects, or the projectId returned by create/ingest/generate tools)",
};

const TRANSCRIPT_PLAN_PROP = {
  type: "object",
  description: "Full edit-plan snapshot; inspect first to get word IDs and latestPlan, then modify and preview",
  properties: {
    version: { type: "number", enum: [1] },
    removedWordIds: { type: "array", items: { type: "string" }, description: "Array of stable word IDs to delete" },
    removeSilence: { type: "boolean" },
    silencePaddingMs: { type: "number", description: "Milliseconds kept on each side of removed silence, 0-1000" },
    wordPaddingMs: { type: "number", description: "Milliseconds of padding around deleted words, 0-250" },
    burnSubtitles: { type: "boolean" },
    captionReplacements: { type: "array", maxItems: 200, description: "Caption phrase corrections, captions only; word IDs within one entry must be consecutive and entries must not overlap", items: { type: "object", properties: { wordIds: { type: "array", minItems: 1, maxItems: 100, items: { type: "string" } }, text: { type: "string", minLength: 1, maxLength: 240 } }, required: ["wordIds", "text"] } },
    sourceRange: {
      type: "object", description: "Optional: keep only this continuous range of the source (seconds); word deletion and silence removal still apply inside it. Omit to use the full source",
      properties: { start: { type: "number", minimum: 0 }, end: { type: "number", minimum: 0 } },
      required: ["start", "end"],
    },
  },
  required: ["version", "removedWordIds", "removeSilence", "silencePaddingMs", "wordPaddingMs", "burnSubtitles"],
};

/** Call the Oryn HTTP API; throws an error with the backend error message on non-2xx responses */
async function api(path, { method = "GET", body, timeoutMs = 600000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  let text;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    // Reading the body must also be within the timeout guard: fetch only resolves when response headers arrive; the timer must stay active to abort a stalled body read
    text = await res.text();
  } catch (e) {
    if (e?.name === "AbortError") throw new Error(`Request timed out: ${path}`);
    throw new Error(`Cannot reach Oryn (${BASE_URL}). Start an instance first: pnpm dev or pnpm start. Original error: ${e?.message || e}`);
  } finally {
    clearTimeout(timer);
  }
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error || data?.raw || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.payload = data;
    throw err;
  }
  return data;
}

/** Ensure LLM config is ready before generating a script; otherwise throw an actionable error */
function requireLlm() {
  if (!LLM.baseUrl || !LLM.apiKey || !LLM.model) {
    throw new Error(
      "Script generation needs an LLM. Set these environment variables for the MCP server: ORYN_LLM_BASE_URL, ORYN_LLM_API_KEY, ORYN_LLM_MODEL (any OpenAI-compatible API, e.g. OpenAI / OpenRouter).",
    );
  }
}

/**
 * Poll for compose result until done/failed (compose is async: it returns compositionId immediately and runs in the background).
 * Pass the compositionId returned by POST to poll that exact run — polling "latest" is racy when
 * concurrent composes (retries, A/B variants) exist. No-id fallback kept for older servers whose
 * GET does not support ?compositionId=. Client deadline (660s) intentionally exceeds the server-side
 * render timeout (600s, composer COMPOSE_TIMEOUT_MS) so slow-but-successful renders aren't misreported.
 */
async function pollCompose(projectId, { compositionId, timeoutMs = 660000, intervalMs = 2500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const query = compositionId ? `?compositionId=${encodeURIComponent(compositionId)}` : "";
  // Note: loops within the given time budget; Date.now() is used only for timeout control, not randomness
  for (;;) {
    const { composition } = await api(`/api/project/${projectId}/compose${query}`);
    const status = composition?.status;
    if (status === "done") return composition;
    if (status === "failed") throw new Error("Composition failed (FFmpeg/TTS error); check the assets and script");
    if (Date.now() > deadline) throw new Error("Composition timed out; check the result later with oryn_get_video");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function absVideoUrl(composition) {
  return composition?.url ? `${BASE_URL}${composition.url}` : null;
}

function ok(textObj) {
  const text = typeof textObj === "string" ? textObj : JSON.stringify(textObj, null, 2);
  return { content: [{ type: "text", text }] };
}

// ---- Tool definitions (JSON Schema, no zod required) ----
const TOOLS = [
  {
    name: "oryn_create_video",
    description:
      "One-sentence video: give a topic and it writes a narration script → a judge panel (pacing / conversational / creativity / structure / visuals) critiques and rewrites weak lines → fills visuals from free stock → free AI voiceover + captions → FFmpeg renders a vertical short video, returning a downloadable video URL. Requires LLM environment variables for the MCP server; stock and voiceover need no keys.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "One-sentence topic, e.g. \"How to make pour-over coffee at home\"" },
        narrationStyle: { type: "string", enum: NARRATION_STYLES, description: "Narration style, default knowledge" },
        durationSec: { type: "number", description: "Target duration (seconds), default 25, recommended 15-60" },
        footage: {
          type: "string",
          enum: FOOTAGE_KINDS,
          description: "Visual type: auto (default; per-shot video first, falls back to images, no keys needed) / image (images only, fastest) / video (video only)",
        },
        wait: {
          type: "boolean",
          description:
            "Default true = wait for composition and return the video URL (up to ~11 minutes; may be cut off by MCP clients with short timeouts). false = return the compositionId right after submitting; poll with oryn_get_video { projectId, compositionId } — recommended for long videos or strict timeouts.",
        },
        ...OUTPUT_OPTION_PROPS,
      },
      required: ["topic"],
    },
  },
  {
    name: "oryn_ingest_product",
    description:
      "Paste a product page URL to automatically extract title / price / product images (parse priority schema.org JSON-LD > OpenGraph > Twitter Card > title/meta), optionally creating a product project and downloading the first few images in one step. The link-first entry point for product videos. Returns projectId, the parsed product info and downloaded images. No LLM needed; works best on pages with standard OG/JSON-LD tags (Shopify, independent stores, TikTok Shop etc.); some platforms block scraping and may parse incompletely.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Product page URL (http/https)" },
        createProject: {
          type: "boolean",
          description: "Create a product project and download the first few product images in one step, default true; false only returns the parsed product info without saving",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "oryn_product_script",
    description:
      "Product script in one go: paste a product URL → extract product info (title / price / images) → the LLM generates several product storyboard scripts; returns projectId and the script data. Equivalent to oryn_ingest_product + the web app's \"Generate product script\" in one step. Generation automatically leans toward styles/hooks that sold better based on your published videos' conversion data. Then render with oryn_compose { projectId }. Requires LLM environment variables.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Product page URL (http/https)" },
        styleType: {
          type: "string",
          enum: ["pain_point", "scene", "comparison", "story", "drama", "reversal", "interview", "unboxing", "product_pov", "talking_head", "auto"],
          description:
            "Script style (four families): narrative — drama two-person skit (conflict dialogue + free multi-voice) / reversal plot twist / interview street interview (host + passers-by) / story; product-led — unboxing review / product_pov product as narrator (first person) / comparison review; talking-head — talking_head creator talking-head / pain_point problem-solution; scene — scene lifestyle recommendation. Default auto (recommended from historical conversion data)",
        },
        durationSec: { type: "number", description: "Target duration (seconds), default 30, recommended 15-60" },
        category: {
          type: "string",
          enum: ["beauty", "food", "home", "fashion", "tech", "other"],
          description: "Product category (beauty / food / home / fashion / digital / other), used for style templates and per-category conversion feedback; defaults to beauty",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "oryn_generate_script",
    description:
      "Generate only a product-agnostic narration storyboard script (no visuals, no composition); returns projectId and the shots (with English stock search terms). Requires the LLM environment variables.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "One-sentence topic" },
        narrationStyle: { type: "string", enum: NARRATION_STYLES, description: "Narration style, default knowledge" },
        durationSec: { type: "number", description: "Target duration (seconds), default 25, recommended 15-60" },
      },
      required: ["topic"],
    },
  },
  {
    name: "oryn_search_stock",
    description:
      "Search the free commercial-use stock library (keyless Openverse images first; instances with Pexels/Pixabay keys also aggregate video). Returns candidates (title/provider/license/author/preview and source page link); search only, no download — for hand-picking or checking licenses. Not needed before auto-filling visuals (create_video/compose fill per shot). English queries recommended. No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (English recommended for better recall)" },
        mediaType: { type: "string", enum: ["image", "video", "audio"], description: "Media type, default image" },
        limit: { type: "number", description: "Number of results, default 8" },
      },
      required: ["query"],
    },
  },
  {
    name: "oryn_list_projects",
    description: "List Oryn projects. Returns an array of projects (id / name / type / status / topic); later tools take projectId from here. No LLM needed.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "oryn_compose",
    description:
      "Compose a project that already has a script and assets (free Edge TTS voiceover + captions) and return the downloadable video URL. Use after generate_script to render separately. No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        autoFillStock: { type: "boolean", description: "Automatically fill shots missing visuals from the free stock library before composing, default true" },
        footage: { type: "string", enum: FOOTAGE_KINDS, description: "Type of auto-filled visuals, default auto" },
        wait: {
          type: "boolean",
          description:
            "Default true = wait for composition and return the video URL. false = return the compositionId right after submitting; poll with oryn_get_video { projectId, compositionId } — recommended for long videos or strict timeouts.",
        },
        ...OUTPUT_OPTION_PROPS,
      },
      required: ["projectId"],
    },
  },
  {
    name: "oryn_update_shots",
    description:
      "Single-line polish: change only the specified shots' lines / visual description / camera without touching other shots — use with oryn_gate / oryn_qc feedback for spot fixes (e.g. \"shot 3's line drags\"), then re-render with oryn_compose; no full regeneration needed (regenerating would discard the judge panel's rewrites). Optionally run the judges again after editing lines (not required before compose). No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        scriptId: { type: "string", description: "ID of the script to edit; defaults to the currently selected script" },
        shots: {
          type: "array",
          description: "Shots to modify (only pass the fields to change)",
          items: {
            type: "object",
            properties: {
              shotId: { type: "number", description: "Shot number" },
              voiceover: { type: "string", description: "New line (keep length close to the original; voiceover duration is pinned to the shot slot)" },
              description: { type: "string", description: "New visual description (write visible action: who does what)" },
              camera: { type: "string", description: "New camera direction" },
            },
            required: ["shotId"],
          },
        },
      },
      required: ["projectId", "shots"],
    },
  },
  {
    name: "oryn_list_voices",
    description: "List the available free Edge TTS English voices. Returns a voice array (value/label/gender/lang) and the default voice; the voice parameter of create_video / compose must come from here. No LLM needed.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "oryn_get_video",
    description:
      "Look up a project's composed video without re-rendering — for polling async create_video/compose output or retrieving an earlier video. Pass compositionId to query that specific composition (avoids mix-ups with concurrent renders); defaults to the latest. Returns the status (composing/done/failed/none) and the downloadable mp4 URL. No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        compositionId: { type: "string", description: "ID of a specific composition (returned by compose/create_video with wait:false); defaults to the latest" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "oryn_trends",
    description:
      "Fetch a region's daily trending searches to suggest topics. Returns topics (with traffic and related news context); entries can be used directly as the oryn_create_video topic. No key, no LLM needed.",
    inputSchema: {
      type: "object",
      properties: { geo: { type: "string", description: "Two-letter region code, e.g. US/GB/CA/AU, default US" } },
    },
  },
  {
    name: "oryn_import_script",
    description:
      "Import a narration you've already written into a project and split it into shots automatically (no AI generation), then render with oryn_compose. Combined with local media this is fully self-sourced production. Returns scriptId and the shot count. No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        script: { type: "string", description: "Your full narration text" },
        title: { type: "string", description: "Optional title" },
      },
      required: ["projectId", "script"],
    },
  },
  {
    name: "oryn_cover",
    description:
      "Grab a frame from the project's latest render and overlay a big title to make a cover/thumbnail (improves click-through). Returns the cover PNG URL. Requires a prior composition. No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        title: { type: "string", description: "Cover title (short and eye-catching)" },
        position: { type: "string", enum: ["center", "lower", "upper"], description: "Title position, default center" },
        frameAt: { type: "number", description: "Frame time (seconds), default 1" },
      },
      required: ["projectId", "title"],
    },
  },
  {
    name: "oryn_shop_qr",
    description:
      "Generate a \"scan to buy\" QR code PNG for a project's product link (for sharing in groups, posts or product pages). The encoded link automatically gets UTM tracking parameters (utm_source=platform, campaign=oryn). Returns the QR PNG URL and the actually encoded shopLink. The project needs a product link (kept automatically when ingesting a product URL), or pass url. No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        url: { type: "string", description: "Product URL (defaults to the project's saved shopUrl)" },
        platform: { type: "string", description: "Distribution platform (used as utm_source, e.g. tiktok/reels/shorts)" },
        size: { type: "number", description: "QR code side length in pixels, default 512" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "oryn_end_card",
    description:
      "Burn a \"scan to buy\" QR code into the last few seconds of a project's latest render (post-processing, pipeline unchanged) to drive conversions. tiktok/reels/shorts carry no in-video QR penalty. The QR encodes the project's product link (with UTM tracking). Returns the new mp4 URL and shopLink (original kept), with a warning when relevant. Requires a prior composition and a product link (or pass url). CTA text is off by default (it easily overlaps video overlays); enable with ctaText. No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        url: { type: "string", description: "Product URL (defaults to the project's saved shopUrl)" },
        platform: {
          type: "string",
          description: "Target platform (used as utm_source): tiktok / reels / shorts. Omit for an unknown-platform reminder",
        },
        force: { type: "boolean", description: "Kept for compatibility; global platforms (tiktok/reels/shorts) carry no in-video QR penalty. Default false" },
        seconds: { type: "number", description: "Seconds to show the QR code at the end, default 3" },
        ctaText: { type: "string", description: "CTA text above the QR code (optional, off by default to avoid overlapping overlays)" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "oryn_export_platform",
    description:
      "Export a project's render to a target platform's spec (post-processing re-encode, pipeline unchanged): blurred fill, letterbox or positioned crop per the platform's frame + a platform bitrate budget (CRF+VBV, Reels 5000 kbps / others 8000) + an ffprobe read-back after export, returning a \"measured bitrate vs encoding target\" report (report.withinCap only means it fits the local encoding budget; platforms may still re-encode). Uses the latest successful composition by default; pass compositionId to pin one for batch/audit reproducibility. Supports tiktok|reels|shorts. Requires a prior composition. No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        platform: { type: "string", enum: ["tiktok", "reels", "shorts"], description: "Target platform" },
        compositionId: { type: "string", description: "Successful composition ID to export (defaults to the latest successful one)" },
        framing: { type: "object", description: "Framing settings, default blur keeps the full frame. crop removes content and burned-in captions outside the frame — preview first.", properties: {
          mode: { type: "string", enum: ["blur", "fit", "crop"] },
          positionX: { type: "number", minimum: 0, maximum: 1, description: "Horizontal crop position: 0 left, 0.5 center, 1 right" },
          positionY: { type: "number", minimum: 0, maximum: 1, description: "Vertical crop position: 0 top, 0.5 center, 1 bottom" },
        } },
        preview: { type: "boolean", description: "true only renders an in-memory JPEG framing preview instead of exporting the full video" },
        previewTime: { type: "number", minimum: 0, description: "Source preview time in seconds, default 0; clamps to near the end if beyond the duration" },
      },
      required: ["projectId", "platform"],
    },
  },
  {
    name: "oryn_qc",
    description:
      "Run automatic QC on a project's latest render (post-processing, pipeline unchanged): stream integrity / duration / resolution checks + black frames (blackdetect) / long silence (silencedetect) / loudness drift (EBU R128 vs -14 LUFS) / frozen frames, returning a structured report (status: ok|warn|fail + per-item checks). Use as a pre-publish gate after batch renders: don't publish failing videos. Requires a prior composition. No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        compositionId: { type: "string", description: "Composition ID to check (defaults to the latest)" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "oryn_master",
    description:
      "Analyze brightness / chroma / saturation differences around the render's real splice points and measure whole-video EBU R128 loudness. Default apply=false returns evidence and suggestions only: no file changes, no model calls, no model cost. apply=true requires explicitly choosing normalizeAudio or deflicker and creates a new non-destructive master version without overwriting the original; normalizeAudio uses two-pass loudness normalization, deflicker re-encodes video and may smooth texture — only enable it when temporal flicker is confirmed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        compositionId: { type: "string", description: "Successful composition ID to analyze or refine; defaults to the latest successful one" },
        apply: { type: "boolean", description: "Default false, analysis only. true creates a new master version" },
        normalizeAudio: { type: "boolean", description: "Two-pass EBU R128 loudness normalization to -14 LUFS; only runs with apply=true" },
        deflicker: { type: "boolean", description: "Temporal deflicker, re-encodes video; only enable with confirmed flicker and apply=true" },
        label: { type: "string", description: "Name of the new master version, up to 60 characters" },
        wait: { type: "boolean", description: "With apply=true waits for completion by default; false returns the compositionId immediately for precise polling with oryn_get_video" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "oryn_gate",
    description:
      "Publish gate (one-step aggregate check to run before delivery/publishing): script readiness (ad-policy risk terms / opening hook / duration / CTA / product in the first 3 seconds) + render QC (black frames / silence / loudness / stream integrity) + asset licensing (commercial risk / attribution) in one run, returning a single status: pass|warn|fail with per-item explanations (report.items[].problems lists the issues). Semantics: fail = must-fix problems, fix before delivery; warn = risks needing human confirmation (license review / attribution) that must be disclosed to the user on delivery; pass = no automatic blockers. With strict=true, warn also makes ok false. No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        compositionId: { type: "string", description: "Composition ID to check (defaults to the latest successful one)" },
        strict: { type: "boolean", description: "Strict mode: warn also blocks (ok=false); recommended before paid promotion" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "oryn_credits",
    description:
      "Export a project's asset license list: per-shot provenance (source / author / license) + commercial-risk grading (NC/ND/unknown licenses flagged \"needs manual review\") + ready-to-paste attribution lines for CC BY assets + BGM licensing. Use when ad review asks for license proof, or to self-check commercial safety before publishing. Returns structured JSON (summary.commercialSafe says whether there are no risk items). No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
      },
      required: ["projectId"],
    },
  },
  {
    name: "oryn_native_feel",
    description:
      "Re-render a project's latest video with a native phone-shot feel (post-processing, pipeline unchanged): handheld micro-shake (deterministic sine-driven; use seed to vary motion across A/B variants) + light grain + slightly de-polished grading. Counters platforms down-ranking over-polished AI-looking content. Returns the new mp4 URL (original kept). Requires a prior composition. No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        strength: { type: "string", enum: ["subtle", "medium"], description: "Strength: subtle (default) / medium noticeable handheld feel" },
        seed: { type: "number", description: "Shake phase seed (pass different values per variant to avoid identical motion)" },
        grain: { type: "boolean", description: "Add grain, default true" },
        vignette: { type: "boolean", description: "Add a light vignette, default false (noticeable, enable as needed)" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "oryn_preview_gif",
    description:
      "Cut a short segment of a project's latest render into a looping GIF preview (for sharing / embedding / list hover). Returns the GIF URL. Requires a prior composition. No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        startSec: { type: "number", description: "Start second, default 0" },
        durationSec: { type: "number", description: "Duration in seconds (1-10), default 4" },
        width: { type: "number", description: "Width in px, default 360" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "oryn_contact_sheet",
    description:
      "Render a project's latest video into one overview PNG: the default smart mode samples frames at real scene changes — splice-point thumbnails get a red border and red lines on the waveform timeline mark every detected cut, so black frames / caption occlusion / jarring splices / clipping / silent tails stand out at a glance. Returns the overview PNG URL, cut times (cuts) and sampled frame times (frameTimes), plus a review proxy URL when proxy=true. Recommended after composing: check this image before telling the user the video is ready. proxy=true also renders a review mp4 (short side ≤720, burned-in timecode) for precise timestamped feedback. Requires a prior composition. No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        frames: { type: "number", description: "Number of filmstrip frames (4-12), default 8" },
        thumbWidth: { type: "number", description: "Frame width in px (120-320), default 180" },
        mode: { type: "string", enum: ["smart", "even"], description: "Frame mode: smart = scene cuts first (default); even = evenly spaced" },
        proxy: { type: "boolean", description: "true also generates a 720p timecoded review proxy" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "oryn_export_subtitle",
    description:
      "Export a project's script captions as SRT or WebVTT (re-editing / native platform captions / accessibility). Returns the caption text (subtitle field, can be saved directly as .srt/.vtt). No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        format: { type: "string", enum: ["srt", "vtt"], description: "Caption format, default srt" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "oryn_find_clips",
    description: "Find short clips in transcribed media by spoken text, sentence ends and pauses. Local and read-only: no model calls, no video rendering. Returns each clip's text, sourceRange, plan and latestRevision; pass a candidate plan to oryn_transcript_edit to preview, then create a new revision after confirming. Matches spoken text literally and uses timing rules to shape suggestions.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        mediaId: { type: "string", description: "ID of the transcribed source media" },
        query: { type: "string", maxLength: 160, description: "Optional: keyword or phrase to match in the spoken text" },
        targetSeconds: { type: "number", minimum: 5, maximum: 120, description: "Target clip length, default 30 seconds" },
        limit: { type: "integer", minimum: 1, maximum: 12, description: "Maximum results, default 6" },
      },
      required: ["projectId", "mediaId"],
    },
  },
  {
    name: "oryn_transcript_inspect",
    description:
      "Inspect an imported source's local transcript and current edit revision. Returns paged stable word IDs, timestamps, latestRevision/latestPlan and the latest execution status; changes no data. Page through long transcripts with offset/limit.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        mediaId: { type: "string", description: "Imported source media ID (returned by the web text-edit workbench or the media API)" },
        offset: { type: "number", description: "Word offset, default 0" },
        limit: { type: "number", description: "Words per page, default 500, max 2000" },
      },
      required: ["projectId", "mediaId"],
    },
  },
  {
    name: "oryn_transcript_edit",
    description:
      "Preview or apply a text edit plan. Default apply=false returns only the deleted word count, ranges, time saved and the next revision — no DB writes, no render; pass apply=true only after the user explicitly confirms. Applying requires the baseRevision from inspect and a stable operationId; repeated operationIds are idempotent and never overwrite the source or older revisions.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        mediaId: { type: "string", description: "Imported source media ID" },
        baseRevision: { type: "number", description: "latestRevision from inspect; the server refuses to apply if the revision has changed" },
        operationId: { type: "string", description: "Stable 8-128 character operation ID; required with apply=true, and retries must reuse the same value" },
        plan: TRANSCRIPT_PLAN_PROP,
        apply: { type: "boolean", description: "Default false = preview only; set true only after the user has reviewed the diff and explicitly confirmed" },
      },
      required: ["projectId", "mediaId", "baseRevision", "plan"],
    },
  },
  {
    name: "oryn_timeline_export",
    description:
      "Export a text edit plan as a professional timeline. OTIO keeps editable video/audio clips, EDL is for classic NLE interchange, CSV is for human review; returns only file content and metadata — no DB writes, no render, no absolute local paths. Get latestPlan with oryn_transcript_inspect first; after editing you can review with a transcript_edit dry run.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        mediaId: { type: "string", description: "Imported source media ID" },
        format: { type: "string", enum: ["otio", "edl", "csv"], description: "Default otio" },
        revision: { type: "number", description: "Optional revision number, written only into delivery metadata and the file name" },
        plan: TRANSCRIPT_PLAN_PROP,
      },
      required: ["projectId", "mediaId", "plan"],
    },
  },
  {
    name: "oryn_carousel",
    description:
      "Render a project's script as image carousel cards (title card + one card per key point, gradient background, default 3:4) for Instagram carousels; returns each card's image URL. Image output beyond video. No LLM needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_ID_PROP,
        width: { type: "number", description: "Card width in px, default 1080" },
        height: { type: "number", description: "Card height in px, default 1440 (3:4)" },
        theme: { type: "string", enum: ["night", "warm", "mint", "mono", "rose"], description: "Card theme color, default night" },
      },
      required: ["projectId"],
    },
  },
];

// ---- Tool handlers ----
async function handleCreateVideo(args) {
  requireLlm();
  const topic = String(args.topic || "").trim();
  if (topic.length < 2) throw new Error("topic is too short; give a complete one-sentence topic");
  const narrationStyle = NARRATION_STYLES.includes(args.narrationStyle) ? args.narrationStyle : "knowledge";
  const targetDuration = Number.isFinite(args.durationSec) ? Number(args.durationSec) : 25;

  // 1) generate script
  const scriptRes = await api("/api/topic/script", {
    method: "POST",
    body: { topic, narrationStyle, targetDuration, llmConfig: LLM },
  });
  const projectId = scriptRes.projectId;
  const shots = scriptRes?.scripts?.[0]?.shots ?? [];

  // 1.5) judge pass: four narrow judges (pacing/spoken-voice/freshness/structure) tear the lines
  // apart and weak ones are rewritten in place — the hands-off chain keeps the quality bar, the
  // agent never operates the panel. Best-effort: a failed pass never blocks the video.
  let judgeRewrites = 0;
  const scriptId = scriptRes?.scripts?.[0]?.id;
  if (scriptId) {
    try {
      const report = await api(`/api/project/${projectId}/script-judge`, {
        method: "POST",
        body: { scriptId, llmConfig: LLM },
      });
      // tier gate (judge v2): auto-apply invariant/default only — taste tier is opinion, not defect;
      // the visual judge's description rewrites ride the same shotTexts PATCH
      const gated = (rows) => (Array.isArray(rows) ? rows.filter((r) => r.tier !== "taste") : []);
      const shotTexts = new Map();
      for (const r of gated(report?.rewrites)) shotTexts.set(r.shotId, { shotId: r.shotId, voiceover: r.voiceover });
      for (const r of gated(report?.descriptionRewrites)) {
        shotTexts.set(r.shotId, { ...(shotTexts.get(r.shotId) ?? { shotId: r.shotId }), description: r.description });
      }
      if (shotTexts.size > 0) {
        await api(`/api/project/${projectId}/scripts`, {
          method: "PATCH",
          body: { scriptId, shotTexts: Array.from(shotTexts.values()) },
        });
        judgeRewrites = shotTexts.size;
      }
    } catch {
      /* quality pass is best-effort */
    }
  }

  // 2) match visuals: free Openverse images by default; with Pexels/Pixabay keys, fetches video B-roll per footage setting
  const mediaType = resolveMediaType(args.footage);
  const fill = await api(`/api/project/${projectId}/stock-fill`, {
    method: "POST",
    body: { source: "all", mediaType, apiKeys: STOCK_KEYS, ...(LLM.baseUrl && LLM.model ? { llmConfig: LLM } : {}) },
  });
  // if no visuals were matched at all, don't force a compose (it would produce a blank/failed video) — return an actionable hint instead
  if (!fill.filled) {
    return ok({
      ok: false,
      projectId,
      footage: mediaType,
      footageFilled: `0/${fill.total}`,
      error:
        "The free stock library found no visuals for this topic, so it can't be composed. Try a more common or specific topic, or configure Pexels/Pixabay keys for the instance (ORYN_PEXELS_KEY) and retry.",
    });
  }

  // 3) compose (free Edge TTS voiceover + captions; optional voice/aspect ratio/quality)
  const body = composeBody(args);
  // if no voice is explicitly specified, use the native English default voice
  if (!body.freeTts.voice) {
    const v = defaultVoiceForTopic(topic);
    if (v) body.freeTts.voice = v;
  }
  // actual voice sent to the backend (including auto-detection above); do NOT call composeBody(args) again — that would produce a fresh body without detection, reporting the wrong voice
  const usedVoice = body.freeTts.voice || "en-US-AvaNeural";
  // POST returns the compositionId of this run — poll that exact one, not "latest"
  const { compositionId } = await api(`/api/project/${projectId}/compose`, { method: "POST", body });
  // wait:false — non-blocking submit (see handleCompose): script/judge/footage results are
  // already known, only the render is left running in the background
  if (args.wait === false) {
    return ok({
      ok: true,
      projectId,
      compositionId,
      status: "composing",
      topic,
      narrationStyle,
      voice: usedVoice,
      shots: shots.length,
      ...(judgeRewrites ? { judgeRewrites } : {}),
      footageFilled: `${fill.filled}/${fill.total}`,
      next: `Composition is running in the background. Poll with oryn_get_video { projectId: "${projectId}", compositionId: "${compositionId}" }.`,
    });
  }
  const composition = await pollCompose(projectId, { compositionId });

  return ok({
    ok: true,
    projectId,
    topic,
    narrationStyle,
    footage: mediaType,
    voice: usedVoice,
    aspectRatio: ASPECT_RATIOS.includes(args.aspectRatio) ? args.aspectRatio : "9:16",
    shots: shots.length,
    // judge panel: how many weak lines were auto-rewritten before composing
    ...(judgeRewrites ? { judgeRewrites } : {}),
    footageFilled: `${fill.filled}/${fill.total}`,
    // material continuity: how many shots reused a provider+author already picked by a same-entity shot
    ...(fill.sameSourceHits ? { sameSourceShots: fill.sameSourceHits } : {}),
    videoUrl: absVideoUrl(composition),
    status: composition.status,
    hint: "videoUrl can be downloaded/played directly (mp4). Export to more platforms from /project/" + projectId + "/export in the Oryn web app.",
  });
}

async function handleGenerateScript(args) {
  requireLlm();
  const topic = String(args.topic || "").trim();
  if (topic.length < 2) throw new Error("topic is too short");
  const narrationStyle = NARRATION_STYLES.includes(args.narrationStyle) ? args.narrationStyle : "knowledge";
  const targetDuration = Number.isFinite(args.durationSec) ? Number(args.durationSec) : 25;
  const res = await api("/api/topic/script", {
    method: "POST",
    body: { topic, narrationStyle, targetDuration, llmConfig: LLM },
  });
  const script = res?.scripts?.[0];
  return ok({
    ok: true,
    projectId: res.projectId,
    title: script?.title ?? "",
    shots: (script?.shots ?? []).map((s) => ({
      shotId: s.shotId,
      duration: s.duration,
      voiceover: s.voiceover,
      stockKeywords: s.stockKeywords ?? [],
    })),
    next: "Render with oryn_compose { projectId }.",
  });
}

async function handleSearchStock(args) {
  const query = String(args.query || "").trim();
  if (!query) throw new Error("query is required");
  const mediaType = ["image", "video", "audio"].includes(args.mediaType) ? args.mediaType : "image";
  const perPage = Number.isFinite(args.limit) ? Math.max(1, Math.min(30, Number(args.limit))) : 8;
  const res = await api("/api/stock/search", {
    method: "POST",
    body: { query, source: "all", mediaType, perPage, download: false, apiKeys: STOCK_KEYS },
  });
  const candidates = (res.candidates ?? []).slice(0, perPage).map((c) => ({
    title: c.title,
    provider: c.source,
    mediaType: c.mediaType,
    preview: c.previewImage,
    pageUrl: c.pageUrl,
    license: c.license,
    author: c.author,
  }));
  return ok({ ok: true, query, count: candidates.length, candidates, skippedSources: res.skippedSources ?? [] });
}

async function handleListProjects() {
  const rows = await api("/api/project");
  const list = (Array.isArray(rows) ? rows : []).map((p) => ({
    id: p.id,
    name: p.name,
    contentType: p.contentType,
    status: p.status,
    topic: p.topic ?? undefined,
  }));
  return ok({ ok: true, count: list.length, projects: list });
}

async function handleCompose(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const autoFill = args.autoFillStock !== false;
  if (autoFill) {
    await api(`/api/project/${projectId}/stock-fill`, {
      method: "POST",
      body: { source: "all", mediaType: resolveMediaType(args.footage), apiKeys: STOCK_KEYS, ...(LLM.baseUrl && LLM.model ? { llmConfig: LLM } : {}) },
    }).catch(() => {}); // stock-fill failure does not block compose (project may already have assets)
  }
  const body = composeBody(args);
  // if no voice is explicitly specified, use the native English default voice (same as create_video)
  if (!body.freeTts.voice) {
    const proj = await api(`/api/project/${projectId}`).catch(() => null);
    const v = proj && proj.topic ? defaultVoiceForTopic(String(proj.topic)) : null;
    if (v) body.freeTts.voice = v;
  }
  // POST returns the compositionId of this run — poll that exact one, not "latest"
  const { compositionId } = await api(`/api/project/${projectId}/compose`, { method: "POST", body });
  // wait:false — non-blocking submit: hand back the compositionId instead of holding the MCP
  // call open for up to 11 minutes (strict-timeout clients would kill the call and orphan the run)
  if (args.wait === false) {
    return ok({
      ok: true,
      projectId,
      compositionId,
      status: "composing",
      next: `Composition is running in the background. Poll with oryn_get_video { projectId: "${projectId}", compositionId: "${compositionId}" }.`,
    });
  }
  const composition = await pollCompose(projectId, { compositionId });
  return ok({ ok: true, projectId, voice: body.freeTts.voice || "en-US-AvaNeural", videoUrl: absVideoUrl(composition), status: composition.status });
}

/**
 * Targeted per-shot copy edits (voiceover / description / camera) through the scripts PATCH —
 * the surgical-fix loop for gate/qc feedback without regenerating the whole script.
 */
async function handleUpdateShots(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const patches = (Array.isArray(args.shots) ? args.shots : [])
    .filter((sh) => sh && Number.isFinite(sh.shotId))
    .map((sh) => ({
      shotId: Number(sh.shotId),
      ...(typeof sh.voiceover === "string" && sh.voiceover.trim() ? { voiceover: sh.voiceover.trim() } : {}),
      ...(typeof sh.description === "string" && sh.description.trim() ? { description: sh.description.trim() } : {}),
      ...(typeof sh.camera === "string" && sh.camera.trim() ? { camera: sh.camera.trim() } : {}),
    }))
    .filter((sh) => Object.keys(sh).length > 1);
  if (patches.length === 0) throw new Error("shots contains no applicable changes (each entry needs at least one of voiceover/description/camera)");
  let scriptId = typeof args.scriptId === "string" && args.scriptId.trim() ? args.scriptId.trim() : "";
  if (!scriptId) {
    const scripts = await api(`/api/project/${projectId}/scripts`);
    const selected = (Array.isArray(scripts) ? scripts : []).find((x) => x.selected) ?? (Array.isArray(scripts) ? scripts[0] : null);
    if (!selected?.id) throw new Error("This project has no script to edit — generate or import one first");
    scriptId = selected.id;
  }
  await api(`/api/project/${projectId}/scripts`, { method: "PATCH", body: { scriptId, shotTexts: patches } });
  return ok({
    ok: true,
    projectId,
    scriptId,
    updatedShots: patches.map((sh) => sh.shotId),
    next: `Updated ${patches.length} shot(s). Re-run oryn_compose { projectId: "${projectId}" } to apply the changes.`,
  });
}

async function handleListVoices() {
  const res = await api("/api/tts/free");
  return ok({ ok: true, default: res.default, voices: res.voices ?? [] });
}

async function handleGetVideo(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  // compositionId pins the query to one specific run — concurrent composes (retries, A/B
  // variants) would otherwise cross results under "latest"
  const compositionId = typeof args.compositionId === "string" && args.compositionId.trim() ? args.compositionId.trim() : "";
  const query = compositionId ? `?compositionId=${encodeURIComponent(compositionId)}` : "";
  const { composition } = await api(`/api/project/${projectId}/compose${query}`);
  if (!composition) {
    return ok({ ok: true, projectId, status: "none", videoUrl: null, hint: "This project has no compositions yet; render with oryn_compose." });
  }
  return ok({
    ok: true,
    projectId,
    status: composition.status,
    videoUrl: absVideoUrl(composition),
    timelineUrl: composition.timelineUrl ? `${BASE_URL}${composition.timelineUrl}` : null,
  });
}

async function handleIngestProduct(args) {
  const url = String(args.url || "").trim();
  if (!/^https?:\/\/.+/i.test(url)) throw new Error("url must be a valid http/https product link");
  const createProject = args.createProject !== false; // create the project and download images by default
  const data = await api("/api/ingest/product", { method: "POST", body: { url, createProject } });
  return ok({
    ok: true,
    projectId: data.projectId ?? null,
    product: data.product ?? null,
    productImages: data.productImages ?? [],
    hint: data.projectId
      ? "Created a product project and fetched product images. Next: generate a product script from the link with oryn_product_script (needs an LLM), or render with oryn_compose."
      : "Parsed only, no project created (createProject=false).",
  });
}

// One-shot commerce script: ingest a product URL → generate a commerce script server-side (needs LLM).
// Chains the two existing routes (/api/ingest/product then /api/llm/script) so agents skip the manual
// hand-off. The script route already folds in the performance-feedback flywheel by category.
async function handleProductScript(args) {
  requireLlm();
  const url = String(args.url || "").trim();
  if (!/^https?:\/\/.+/i.test(url)) throw new Error("url must be a valid http/https product link");

  // Step 1: ingest the product (creates the project + downloads images; no LLM needed)
  const ingest = await api("/api/ingest/product", { method: "POST", body: { url, createProject: true } });
  const projectId = ingest.projectId;
  if (!projectId) throw new Error("Could not create a project from this link (it may block scraping or lack standard product tags). Try another link or upload product images in the web app.");
  const productName = ingest.product?.title?.trim();
  if (!productName) throw new Error("Could not parse a product title, so no product script can be generated. Try a link with standard OG/JSON-LD tags.");

  // Step 2: generate the commerce script from the ingested product data (LLM)
  const styleType = ["pain_point", "scene", "comparison", "story", "drama", "reversal", "interview", "unboxing", "product_pov", "talking_head", "auto"].includes(args.styleType) ? args.styleType : "auto";
  const targetDuration = Number.isFinite(args.durationSec) ? Number(args.durationSec) : 30;
  const scriptRes = await api("/api/llm/script", {
    method: "POST",
    body: {
      projectId,
      productName,
      productDescription: ingest.product?.description ?? "",
      productImages: ingest.productImages ?? [],
      ...(args.category ? { category: args.category } : {}),
      styleType,
      targetDuration,
      llmConfig: LLM,
    },
  });

  const scripts = Array.isArray(scriptRes?.scripts) ? scriptRes.scripts : [];
  return ok({
    ok: true,
    projectId,
    product: ingest.product ?? null,
    productImages: ingest.productImages ?? [],
    scripts: scripts.map((s) => ({
      id: s.id,
      title: s.title ?? "",
      styleType: s.styleType,
      totalDuration: s.totalDuration ?? 0,
      selected: s.selected ?? false,
      shots: (s.shots ?? []).map((sh) => ({
        shotId: sh.shotId,
        duration: sh.duration,
        voiceover: sh.voiceover,
        stockKeywords: sh.stockKeywords ?? [],
      })),
    })),
    next: `Generated ${scripts.length} product script(s) (the first is selected). Next, run oryn_compose { projectId: "${projectId}" } to add visuals + voiceover and render.`,
  });
}

// Trending topics → suggest what to make next
async function handleTrends(args) {
  const geo = typeof args.geo === "string" && /^[a-z]{2}$/i.test(args.geo) ? args.geo : "US";
  const res = await api(`/api/trends?geo=${encodeURIComponent(geo)}`);
  return ok({ ok: true, geo: res.geo, count: res.count ?? (res.topics || []).length, topics: res.topics ?? [] });
}

// Import a user-written script → split into shots (no LLM)
async function handleImportScript(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const script = String(args.script || "").trim();
  if (script.length < 2) throw new Error("script is too short; provide the full narration text");
  const res = await api(`/api/project/${projectId}/import-script`, {
    method: "POST",
    body: { script, title: typeof args.title === "string" ? args.title : undefined },
  });
  return ok({ ok: true, projectId, scriptId: res.scriptId, shots: res.shots, next: "Render with oryn_compose { projectId }." });
}

// Cover/thumbnail: frame + bold title overlay from the latest composed video
async function handleCover(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const title = String(args.title || "").trim();
  if (!title) throw new Error("title is required");
  const body = { title };
  if (["center", "lower", "upper"].includes(args.position)) body.position = args.position;
  if (Number.isFinite(args.frameAt)) body.frameAt = args.frameAt;
  const res = await api(`/api/project/${projectId}/cover`, { method: "POST", body });
  return ok({ ok: true, projectId, cover: res.cover ? `${BASE_URL}${res.cover}` : null });
}

// Shop "scan to buy" QR from the project's shop link (UTM-tagged)
async function handleShopQr(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const body = {};
  if (typeof args.url === "string" && args.url.trim()) body.url = args.url.trim();
  if (typeof args.platform === "string" && args.platform.trim()) body.platform = args.platform.trim();
  if (Number.isFinite(args.size)) body.size = args.size;
  const res = await api(`/api/project/${projectId}/shop-qr`, { method: "POST", body });
  return ok({
    ok: true,
    projectId,
    qr: res.qr ? `${BASE_URL}${res.qr}` : null,
    shopLink: res.shopLink ?? null,
    ...(res.warning ? { warning: res.warning } : {}),
  });
}

// Burn a "scan to buy" QR onto the last few seconds of the composed video
async function handleEndCard(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const body = {};
  if (typeof args.url === "string" && args.url.trim()) body.url = args.url.trim();
  if (typeof args.platform === "string" && args.platform.trim()) body.platform = args.platform.trim();
  if (args.force === true) body.force = true; // legacy override flag, forwarded as-is
  if (Number.isFinite(args.seconds)) body.seconds = args.seconds;
  if (typeof args.ctaText === "string" && args.ctaText.trim()) body.ctaText = args.ctaText.trim();
  const res = await api(`/api/project/${projectId}/end-card`, { method: "POST", body });
  return ok({
    ok: true,
    projectId,
    video: res.video ? `${BASE_URL}${res.video}` : null,
    shopLink: res.shopLink ?? null,
    ...(res.warning ? { warning: res.warning } : {}),
  });
}

// Automated quality check over the latest composed video (streams / black / silence / loudness / freeze)
async function handleQc(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const body = {};
  if (typeof args.compositionId === "string" && args.compositionId.trim()) body.compositionId = args.compositionId.trim();
  const res = await api(`/api/project/${projectId}/qc`, { method: "POST", body });
  return ok({ ok: res.status !== "fail", projectId, compositionId: res.compositionId ?? null, status: res.status, checks: res.checks ?? [] });
}

// Read-only continuity/loudness analysis by default; explicit apply options create
// a new composition version and never overwrite the selected source composition.
async function handleMaster(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const apply = args.apply === true;
  const normalizeAudio = args.normalizeAudio === true;
  const deflicker = args.deflicker === true;
  if (!apply && (normalizeAudio || deflicker)) {
    throw new Error("normalizeAudio / deflicker require apply=true; apply=false only analyzes");
  }
  if (apply && !normalizeAudio && !deflicker) {
    throw new Error("apply=true requires at least one of normalizeAudio or deflicker");
  }
  const body = { action: apply ? "render" : "analyze" };
  if (typeof args.compositionId === "string" && args.compositionId.trim()) body.compositionId = args.compositionId.trim();
  if (apply) {
    body.normalizeAudio = normalizeAudio;
    body.deflicker = deflicker;
    if (typeof args.label === "string" && args.label.trim()) body.label = args.label.trim();
  }
  const res = await api(`/api/project/${projectId}/mastering`, { method: "POST", body });
  if (!apply) {
    return ok({ ok: true, projectId, compositionId: res.compositionId ?? null, analysis: res.analysis ?? null });
  }
  if (args.wait === false) {
    return ok({
      ok: true,
      projectId,
      compositionId: res.compositionId,
      status: res.status,
      analysis: res.analysis ?? null,
      options: res.options ?? null,
      next: `The master is rendering in the background. Poll with oryn_get_video { projectId: "${projectId}", compositionId: "${res.compositionId}" }.`,
    });
  }
  const composition = await pollCompose(projectId, { compositionId: res.compositionId });
  return ok({
    ok: true,
    projectId,
    compositionId: composition.id,
    status: composition.status,
    videoUrl: absVideoUrl(composition),
    analysis: res.analysis ?? null,
    options: res.options ?? null,
  });
}

// Platform export with anti-recompression bitrate cap + measured-vs-line report
async function handleExportPlatform(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const platform = String(args.platform || "").trim();
  if (!platform) throw new Error("platform is required");
  const body = { platform };
  if (args.compositionId !== undefined) {
    if (typeof args.compositionId !== "string" || !/^[a-zA-Z0-9-]+$/.test(args.compositionId.trim())) throw new Error("Invalid composition ID");
    body.compositionId = args.compositionId.trim();
  }
  for (const key of ["framing", "preview", "previewTime"]) if (args[key] !== undefined) body[key] = args[key];
  const res = await api(`/api/project/${projectId}/export-platform`, { method: "POST", body });
  if (args.preview === true) return { content: [
    { type: "text", text: JSON.stringify({ compositionId: res.compositionId, platform, framing: res.framing, previewTime: res.previewTime, size: res.size }) },
    { type: "image", data: res.preview.split(",")[1], mimeType: "image/jpeg" },
  ] };
  return ok({ ok: true, projectId, compositionId: res.compositionId ?? null, platform, platformName: res.platformName, framing: res.framing, url: res.url, size: res.size, report: res.report ?? null });
}

// Release gate: aggregated pre-publish verdict (script readiness + video QC + asset licenses)
async function handleGate(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const body = {};
  if (typeof args.compositionId === "string" && args.compositionId.trim()) body.compositionId = args.compositionId.trim();
  const res = await api(`/api/project/${projectId}/gate`, { method: "POST", body });
  const status = res.report?.status ?? "fail";
  const blocked = status === "fail" || (args.strict === true && status !== "pass");
  return ok({ ok: !blocked, projectId, compositionId: res.compositionId ?? null, status, report: res.report ?? null });
}

// Asset license manifest (per-shot provenance + commercial-risk flags + attribution lines)
async function handleCredits(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const m = await api(`/api/project/${projectId}/credits`);
  return ok({ ok: true, projectId, summary: m.summary, items: m.items ?? [], bgm: m.bgm ?? null });
}

// Hand-shot look post-process over the latest composed video
async function handleNativeFeel(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const body = {};
  if (args.strength === "medium" || args.strength === "subtle") body.strength = args.strength;
  if (Number.isFinite(args.seed)) body.seed = args.seed;
  if (typeof args.grain === "boolean") body.grain = args.grain;
  if (args.vignette === true) body.vignette = true;
  const res = await api(`/api/project/${projectId}/native-feel`, { method: "POST", body });
  return ok({ ok: true, projectId, video: res.video ? `${BASE_URL}${res.video}` : null, strength: res.strength ?? null });
}

// GIF preview from the latest composed video
async function handlePreviewGif(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const body = {};
  if (Number.isFinite(args.startSec)) body.startSec = args.startSec;
  if (Number.isFinite(args.durationSec)) body.durationSec = args.durationSec;
  if (Number.isFinite(args.width)) body.width = args.width;
  const res = await api(`/api/project/${projectId}/preview-gif`, { method: "POST", body });
  return ok({ ok: true, projectId, gif: res.gif ? `${BASE_URL}${res.gif}` : null });
}

// Contact sheet: one-image overview (filmstrip + waveform) of the latest composed video — the
// agent-side eyeball check: fetch the PNG and *look* at it before telling the user the video is good
async function handleContactSheet(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const body = {};
  if (Number.isFinite(args.frames)) body.frames = args.frames;
  if (Number.isFinite(args.thumbWidth)) body.thumbWidth = args.thumbWidth;
  if (args.mode === "even" || args.mode === "smart") body.mode = args.mode;
  if (args.proxy === true) body.proxy = true;
  const res = await api(`/api/project/${projectId}/contact-sheet`, { method: "POST", body });
  return ok({
    ok: true,
    projectId,
    sheet: res.sheet ? `${BASE_URL}${res.sheet}` : null,
    layout: res.layout ?? null,
    mode: res.mode ?? null,
    cuts: res.cuts ?? [],
    frameTimes: res.frameTimes ?? [],
    proxy: res.proxy ? `${BASE_URL}${res.proxy}` : null,
  });
}

// Export the project's subtitles as SRT/WebVTT (the route returns text, wrapped as { raw } by api())
async function handleExportSubtitle(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const format = args.format === "vtt" ? "vtt" : "srt";
  const data = await api(`/api/project/${projectId}/subtitle?format=${format}`);
  const subtitle = typeof data === "string" ? data : data.raw ?? "";
  return ok({ ok: true, projectId, format, subtitle });
}

async function handleFindClips(args) {
  const projectId = String(args.projectId || "").trim();
  const mediaId = String(args.mediaId || "").trim();
  if (!projectId || !mediaId) throw new Error("projectId and mediaId are required");
  const params = new URLSearchParams({ query: String(args.query ?? ""), targetSeconds: String(args.targetSeconds ?? 30), limit: String(args.limit ?? 6) });
  return ok(await api(`/api/project/${encodeURIComponent(projectId)}/media/${encodeURIComponent(mediaId)}/clips?${params}`));
}

async function handleTranscriptInspect(args) {
  const projectId = String(args.projectId || "").trim();
  const mediaId = String(args.mediaId || "").trim();
  if (!projectId || !mediaId) throw new Error("projectId and mediaId are required");
  const offset = Number.isInteger(args.offset) ? Math.max(0, Number(args.offset)) : 0;
  const limit = Number.isInteger(args.limit) ? Math.min(2000, Math.max(1, Number(args.limit))) : 500;
  const result = await api(`/api/project/${encodeURIComponent(projectId)}/media/${encodeURIComponent(mediaId)}/edit?offset=${offset}&limit=${limit}`);
  return ok({
    ok: true,
    ...result,
    next: result.transcript?.hasMore
      ? `Continue reading at offset=${result.transcript.wordOffset + result.transcript.words.length}; after editing the full plan, preview with oryn_transcript_edit (apply=false) first.`
      : "After editing the full plan, preview with oryn_transcript_edit (apply=false) first; show the user the diff and only apply=true after confirmation.",
  });
}

async function handleTranscriptEdit(args) {
  const projectId = String(args.projectId || "").trim();
  const mediaId = String(args.mediaId || "").trim();
  if (!projectId || !mediaId) throw new Error("projectId and mediaId are required");
  if (!Number.isInteger(args.baseRevision) || Number(args.baseRevision) < 0) throw new Error("baseRevision must come from oryn_transcript_inspect");
  if (!args.plan || typeof args.plan !== "object") throw new Error("plan is required");
  const apply = args.apply === true;
  const operationId = typeof args.operationId === "string" ? args.operationId.trim() : "";
  if (apply && !operationId) throw new Error("apply=true requires a stable operationId; reuse the same value on retries");
  const result = await api(`/api/project/${encodeURIComponent(projectId)}/media/${encodeURIComponent(mediaId)}/edit`, {
    method: "POST",
    body: {
      action: apply ? "apply" : "preview",
      operationId: operationId || undefined,
      actor: "mcp",
      baseRevision: Number(args.baseRevision),
      plan: args.plan,
    },
  });
  return ok({
    ok: true,
    projectId,
    mediaId,
    ...result,
    next: apply
      ? "Edit revision submitted; check latestEdit.status with oryn_transcript_inspect, then run QC when it finishes."
      : "This is a dry run — nothing written or rendered yet. Show proposal.diff/summary to the user; after explicit confirmation call apply=true with the same plan, baseRevision and proposal.operationId.",
  });
}

async function handleTimelineExport(args) {
  const projectId = String(args.projectId || "").trim();
  const mediaId = String(args.mediaId || "").trim();
  if (!projectId || !mediaId) throw new Error("projectId and mediaId are required");
  if (!args.plan || typeof args.plan !== "object") throw new Error("plan is required");
  const format = ["otio", "edl", "csv"].includes(args.format) ? args.format : "otio";
  const result = await api(`/api/project/${encodeURIComponent(projectId)}/media/${encodeURIComponent(mediaId)}/timeline`, {
    method: "POST",
    body: {
      format,
      plan: args.plan,
      inline: true,
      ...(Number.isInteger(args.revision) && args.revision > 0 ? { revision: args.revision } : {}),
    },
  });
  return ok({
    ok: true,
    projectId,
    mediaId,
    format,
    fileName: result.fileName,
    mimeType: result.mimeType,
    clips: result.clips,
    duration: result.duration,
    frameRate: result.frameRate,
    content: result.content,
    next: `Save content as-is to ${result.fileName}; after importing into your editor, relink media by the original file names.`,
  });
}

// Image-card carousel from the script
async function handleCarousel(args) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const body = {};
  if (Number.isFinite(args.width)) body.width = args.width;
  if (Number.isFinite(args.height)) body.height = args.height;
  if (typeof args.theme === "string") body.theme = args.theme;
  const res = await api(`/api/project/${projectId}/carousel`, { method: "POST", body });
  return ok({ ok: true, projectId, count: res.count, cards: (res.cards || []).map((c) => `${BASE_URL}${c}`) });
}

const HANDLERS = {
  oryn_create_video: handleCreateVideo,
  oryn_ingest_product: handleIngestProduct,
  oryn_product_script: handleProductScript,
  oryn_generate_script: handleGenerateScript,
  oryn_search_stock: handleSearchStock,
  oryn_list_projects: handleListProjects,
  oryn_compose: handleCompose,
  oryn_update_shots: handleUpdateShots,
  oryn_list_voices: handleListVoices,
  oryn_get_video: handleGetVideo,
  oryn_trends: handleTrends,
  oryn_import_script: handleImportScript,
  oryn_cover: handleCover,
  oryn_shop_qr: handleShopQr,
  oryn_end_card: handleEndCard,
  oryn_export_platform: handleExportPlatform,
  oryn_qc: handleQc,
  oryn_master: handleMaster,
  oryn_gate: handleGate,
  oryn_credits: handleCredits,
  oryn_native_feel: handleNativeFeel,
  oryn_preview_gif: handlePreviewGif,
  oryn_contact_sheet: handleContactSheet,
  oryn_export_subtitle: handleExportSubtitle,
  oryn_transcript_inspect: handleTranscriptInspect,
  oryn_find_clips: handleFindClips,
  oryn_transcript_edit: handleTranscriptEdit,
  oryn_timeline_export: handleTimelineExport,
  oryn_carousel: handleCarousel,
};

// ---- Start MCP server ----
const server = new Server(
  { name: "oryn", version: "0.9.7" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const handler = HANDLERS[req.params.name];
  if (!handler) {
    // Name the valid tools so the calling model can self-correct instead of retrying blind
    return {
      content: [{ type: "text", text: `Unknown tool: ${req.params.name}. Available tools: ${Object.keys(HANDLERS).join(", ")}` }],
      isError: true,
    };
  }
  try {
    return await handler(req.params.arguments ?? {});
  } catch (e) {
    return { content: [{ type: "text", text: `Call failed: ${e?.message || e}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
// startup log goes to stderr (stdout is reserved for the MCP protocol)
console.error(`Oryn MCP server started · target instance ${BASE_URL}`);
