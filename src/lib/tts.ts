import { resolveServerKey } from "@/lib/server-keys";
/**
 * TTS dubbing — unified entry point for multiple platforms.
 *
 * Supports three paid TTS providers, dispatched by config.provider
 * (defaults to "openai" for backward compatibility with legacy configs):
 * - openai: OpenAI-compatible /audio/speech (tts-1, gpt-4o-mini-tts, or any compatible endpoint), synchronous mp3.
 * - atlas: Atlas Cloud generateAudio (xai/tts-v1), async — submit, get prediction id, then poll for audio URL.
 *
 * All providers produce mp3 bytes (Buffer); callers (compose/preview) need not handle provider differences.
 */

import type { TTSProvider } from "./tts-presets";
import { CircuitBreaker } from "@/lib/circuit-breaker";
import { ttsCacheKey, readTtsCache, writeTtsCache } from "@/lib/tts-cache";
import { stripPauseMarks } from "@/lib/voice-markup";

export interface TTSConfig {
  /** Platform; defaults to "openai" */
  provider?: TTSProvider;
  /** baseUrl (meaning varies by platform: root for OpenAI-compatible, service root for Atlas) */
  baseUrl: string;
  apiKey: string;
  /** Model id */
  model: string;
  /** Voice / voice_id */
  voice: string;
  /** Playback speed multiplier, 0.5–2 (each platform clamps to its own valid range); defaults to 1 */
  speed?: number;
  /** Legacy field kept for stored-config compatibility (unused) */
  groupId?: string;
  /**
   * Expressive delivery, per shot (optional):
   *  - emotion: delivery tag from the script; current providers ignore it.
   *  - instruction: natural-language delivery note — sent on the OpenAI-compatible path
   *    only for models known to accept `instructions`; ignored elsewhere.
   * Both are part of the cache identity (a different delivery is different audio).
   */
  emotion?: string;
  instruction?: string;
}

/** OpenAI-compatible TTS models known to accept the `instructions` parameter. */
const OPENAI_INSTRUCTION_MODELS = /gpt-4o-mini-tts/i;

/** Generate TTS audio, returns mp3 bytes. Throws on failure; caller decides on fallback. */
// Circuit breaker: after 2 consecutive failures for the same provider (most likely an invalid key
// or downed service), fail-fast all subsequent TTS calls so a bad key doesn't let every shot in a
// batch time out individually and stall the whole compose pipeline; auto half-opens after 30s.
const ttsBreakers = new Map<string, CircuitBreaker>();
function ttsBreaker(provider: string): CircuitBreaker {
  let b = ttsBreakers.get(provider);
  if (!b) {
    b = new CircuitBreaker(2, 30_000);
    ttsBreakers.set(provider, b);
  }
  return b;
}

/**
 * Whether a TTS failure is worth retrying: deterministic rejections (bad key 401/403, bad params
 * 400/422, missing route 404, out of credit 402) will fail identically on every attempt, while
 * network-level throws, timeouts, 408/429 and 5xx are exactly the transient wobbles where one
 * retry saves a silent shot in the final video. Exported for tests.
 */
export function isRetryableTTSError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const status = msg.match(/\b(4\d{2}|5\d{2})\b/)?.[1];
  if (status) {
    const s = Number(status);
    return s === 408 || s === 429 || s >= 500;
  }
  // No HTTP status in the message: connection reset / fetch failed / poll timeout — transient.
  return true;
}

/** Run a TTS call with up to 2 retries (1s apart) on transient failures only. */
async function withTTSRetry(fn: () => Promise<Buffer>): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isRetryableTTSError(e) || attempt === 2) throw e;
      await sleep(1000);
    }
  }
  throw lastErr;
}

export async function generateSpeech(text: string, config: TTSConfig): Promise<Buffer> {
  // paid engines would try to SPEAK the [pause] breath marker — only the free Edge
  // path renders it (as a real SSML break); everyone else gets clean text
  const clean = stripPauseMarks((text || "").trim());
  if (!clean) throw new Error("Voiceover text is empty");
  const provider = config.provider || "openai";
  // Content-addressed cache: identical text + voice params reuse the previously synthesized
  // audio, so a re-compose (e.g. after a BGM tweak) doesn't re-bill the paid TTS provider.
  // baseUrl is part of the identity — the same model/voice names on different endpoints
  // (OpenAI vs Atlas vs others…) are different engines producing different audio.
  // apiKey/groupId are deliberately excluded: they select the account, not the sound.
  // Checked before the circuit breaker so cached audio still works while the breaker is open.
  const cacheKey = ttsCacheKey({
    provider,
    baseUrl: config.baseUrl,
    model: config.model,
    voice: config.voice,
    speed: config.speed,
    // expressive delivery changes the audio → changes the identity
    ...(config.emotion && { emotion: config.emotion }),
    ...(config.instruction && { instruction: config.instruction }),
    text: clean,
  });
  const cached = await readTtsCache(cacheKey);
  if (cached) return cached;
  const breaker = ttsBreaker(provider);
  if (breaker.isOpen()) {
    throw new Error(`Voiceover service (${provider}) failed repeatedly and is temporarily tripped — check that platform's key/service; it retries automatically in about 30 seconds`);
  }
  try {
    // Retries live INSIDE one breaker-accounted call: the breaker judges the final outcome, so a
    // wobble that recovers on retry doesn't burn a failure toward the 2-strike trip threshold.
    const buf = await withTTSRetry(() => dispatchTTS(clean, config));
    breaker.recordSuccess();
    // Write-through on success only (failures are never cached); cache errors degrade silently
    await writeTtsCache(cacheKey, buf);
    return buf;
  } catch (e) {
    breaker.recordFailure();
    throw e;
  }
}

/**
 * Rough speech-duration estimate in seconds, used when ffprobe cannot report the length
 * of a synthesized audio file (issue #14: a failed probe fell back to the script's guessed
 * shot duration, hard-trimming the narration mid-sentence).
 * Calibrated for English narration voices at 1.0x speed (~2.8 words/sec, plus
 * punctuation pauses) and deliberately errs long by 15%: extra tail
 * silence is harmless, while an under-estimate cuts speech.
 */
export function estimateSpeechSeconds(text: string): number {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return 0;
  let cjkChars = 0;
  let pauses = 0;
  let latin = "";
  for (const ch of Array.from(clean)) {
    if (/[\u2e80-\u9fff\u8c48-\ufaff\u3040-\u30ff\uac00-\ud7a3]/.test(ch)) cjkChars++;
    else if (/[\u3002\uff01\uff1f\uff1b\uff0c\u3001\uff1a…!?;,.]/.test(ch)) pauses++;
    else latin += ch;
  }
  const latinWords = latin.split(/\s+/).filter(Boolean).length;
  const sec = cjkChars / 4.2 + latinWords / 2.8 + pauses * 0.2;
  return Math.max(1, sec * 1.15);
}

function dispatchTTS(clean: string, config: TTSConfig): Promise<Buffer> {
  switch (config.provider) {
    case "atlas":
      return generateSpeechAtlas(clean, config);
    default:
      return generateSpeechOpenAI(clean, config);
  }
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Truncate error body to 200 characters and explicitly mark the ellipsis, avoiding silent truncation that could be mistaken for a complete error message */
const clipErr = (s: string) => (s.length > 200 ? s.slice(0, 200) + "…(truncated)" : s);

/** Normalize an audio field from a response (URL / data URI / base64 / hex) by downloading or decoding it into a Buffer */
async function audioToBuffer(input: string): Promise<Buffer> {
  const s = input.trim();
  if (/^https?:\/\//i.test(s)) {
    // 30s timeout: prevents indefinite blocking when a remote audio server is slow or hung,
    // which would stall the entire TTS → compose pipeline
    const resp = await fetch(s, { signal: AbortSignal.timeout(30000) });
    if (!resp.ok) throw new Error(`Audio download failed: ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  }
  if (s.startsWith("data:")) {
    const comma = s.indexOf(",");
    // A well-formed data URI always has a comma before the payload; without it, slice(0) would
    // feed the "data:...;base64" header into the base64 decoder and yield garbage/empty audio.
    if (comma === -1) throw new Error("Malformed audio data URI (missing comma separator)");
    return Buffer.from(s.slice(comma + 1), "base64");
  }
  // Pure hex (only 0-9a-f and even length): decode as hex; otherwise decode as base64
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) return Buffer.from(s, "hex");
  return Buffer.from(s, "base64");
}

// ==================== OpenAI-compatible /audio/speech ====================

async function generateSpeechOpenAI(text: string, config: TTSConfig): Promise<Buffer> {
  const base = config.baseUrl.replace(/\/$/, "");
  const resp = await fetch(`${base}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolveServerKey(config.apiKey)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: text,
      voice: config.voice,
      response_format: "mp3",
      ...(config.speed != null && { speed: config.speed }),
      // delivery note only for models that accept it — others 400 on unknown params
      ...(config.instruction && OPENAI_INSTRUCTION_MODELS.test(config.model) && { instructions: config.instruction }),
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`TTS request failed: ${resp.status} ${resp.statusText} - ${clipErr(errText)}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

// ==================== Atlas Cloud generateAudio (async polling) ====================

interface AtlasPrediction {
  id?: string;
  status?: string;
  outputs?: string[];
  output?: string | { audio?: string; url?: string };
  audio?: string;
  error?: string;
  data?: AtlasPrediction;
}

async function generateSpeechAtlas(text: string, config: TTSConfig): Promise<Buffer> {
  const base = (config.baseUrl || "https://api.atlascloud.ai/api/v1").replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${resolveServerKey(config.apiKey)}`, "Content-Type": "application/json" };

  const submit = await fetch(`${base}/model/generateAudio`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model || "xai/tts-v1",
      text,
      language: "auto",
      voice_id: config.voice || "eve",
      codec: "mp3",
      ...(config.speed != null && { speed: clamp(config.speed, 0.7, 1.5) }),
    }),
    signal: AbortSignal.timeout(30000), // 30s timeout on submit to avoid hanging
  });
  if (!submit.ok) {
    const t = await submit.text().catch(() => "");
    throw new Error(`Atlas TTS submission failed: ${submit.status} - ${clipErr(t)}`);
  }
  const sj = (await submit.json()) as { data?: { id?: string }; id?: string };
  const taskId = sj?.data?.id ?? sj?.id;
  if (!taskId) throw new Error("Atlas TTS returned no task id");

  // Poll for prediction result (TTS usually completes within a few seconds)
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    // 10s timeout per poll; on timeout or network jitter just skip this round and retry next,
    // so a single slow poll doesn't deadlock the entire generation
    let pr: Response;
    try {
      pr = await fetch(`${base}/model/prediction/${taskId}`, { headers, signal: AbortSignal.timeout(10000) });
    } catch {
      continue;
    }
    if (!pr.ok) continue;
    let raw: AtlasPrediction;
    try {
      raw = (await pr.json()) as AtlasPrediction;
    } catch {
      continue; // malformed JSON on a 200 → skip this poll and retry, don't crash the whole generation
    }
    const p: AtlasPrediction = raw.data ?? raw;
    const status = (p.status || "").toLowerCase();
    if (status === "completed" || status === "succeeded") {
      const audio =
        p.outputs?.[0] ??
        (typeof p.output === "string" ? p.output : p.output?.url || p.output?.audio) ??
        p.audio;
      if (!audio) throw new Error("Atlas TTS finished but returned no audio");
      return audioToBuffer(audio);
    }
    if (status === "failed" || status === "error") {
      throw new Error(`Atlas TTS failed: ${p.error || status}`);
    }
  }
  throw new Error("Atlas TTS polling timed out");
}


