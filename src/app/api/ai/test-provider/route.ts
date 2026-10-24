import { NextRequest, NextResponse } from "next/server";
import { resolveServerKey } from "@/lib/server-keys";
import { normalizeChatBase } from "@/lib/llm-models";

/**
 * AI platform key connectivity check (image/video generation platforms).
 * Each platform is probed with its cheapest auth-first endpoint:
 * - 2xx → ok (key is valid)
 * - 401/403 → invalid (key rejected)
 * - anything else (404/400/5xx/network) → unknown (cannot tell; try a generation directly)
 * Runs server-side to avoid browser CORS; read-only probes never start a billable generation.
 */

const DEFAULT_BASE: Record<string, string> = {
  "atlas-cloud": "https://api.atlascloud.ai/api/v1",
  "fal-ai": "https://queue.fal.run",
  replicate: "https://api.replicate.com/v1",
  openai: "https://api.openai.com/v1",
};

type Probe = { url: string; headers: Record<string, string>; authFirst?: boolean; method?: "GET" | "POST"; body?: string };

function buildProbe(name: string, apiKey: string, baseUrl?: string): Probe {
  const base = (baseUrl || DEFAULT_BASE[name] || "").replace(/\/$/, "");
  if (name === "fal-ai") {
    // fal checks auth before resolving the request id: reaching 404/422 means the key is valid
    return {
      url: `${base}/fal-ai/flux/requests/00000000-0000-0000-0000-000000000000/status`,
      headers: { Authorization: `Key ${apiKey}` },
      authFirst: true,
    };
  }
  if (name === "replicate") {
    return { url: `${base}/account`, headers: { Authorization: `Bearer ${apiKey}` } };
  }
  if (name === "atlas-cloud") {
    // Atlas's GET /models is a public catalog (2xx even for bad keys) and it has no read-only auth
    // endpoint, so probe the OpenAI-compatible chat gateway (/v1, not the media gateway /api/v1,
    // which 404s for valid keys — issue #24) with the cheapest model and max_tokens:1.
    return {
      url: `${normalizeChatBase(base)}/chat/completions`,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST",
      body: JSON.stringify({
        // non-thinking flash tier: a thinking model can burn reasoning tokens even at max_tokens:1
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
    };
  }
  // OpenAI / custom OpenAI-compatible: GET /models
  return { url: `${base}/models`, headers: { Authorization: `Bearer ${apiKey}` } };
}

export async function POST(req: NextRequest) {
  let body: { name?: string; apiKey?: string; baseUrl?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const { name, apiKey, baseUrl } = body;
  if (!name || !apiKey) {
    return NextResponse.json({ status: "unknown", message: "Missing platform or key" }, { status: 400 });
  }

  let probe: Probe;
  try {
    probe = buildProbe(name, resolveServerKey(apiKey), baseUrl);
  } catch (e) {
    return NextResponse.json({ status: "invalid", message: e instanceof Error ? e.message : String(e) });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(probe.url, { method: probe.method ?? "GET", headers: probe.headers, body: probe.body, signal: controller.signal });
    if (r.status === 401 || r.status === 403) {
      return NextResponse.json({ status: "invalid", message: "Key is invalid or lacks permission" });
    }
    if (r.ok || probe.authFirst) {
      // authFirst platforms: anything other than 401/403 means auth passed
      return NextResponse.json({ status: "ok", message: "Connected" });
    }
    return NextResponse.json({ status: "unknown", message: `Could not verify (HTTP ${r.status}); try a generation directly` });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return NextResponse.json({ status: "unknown", message: aborted ? "Timed out; could not verify" : "Network error; could not verify" });
  } finally {
    clearTimeout(timer);
  }
}
