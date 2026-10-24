// @vitest-environment node
/**
 *
 */
import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import OpenAI from "openai";
import { probeLLMEndpoint, PROBE_MAX_TOKENS } from "@/lib/llm-probe";
import { listModels, modelListHint, isOllama, normalizeBase, normalizeChatBase } from "@/lib/llm-models";
import { LLMRequestError, createLLMClient, explainLLMStatus, isTokenCapRejection, withLLMErrors } from "@/lib/llm-error";
import { LLM_PRESETS } from "@/lib/llm-presets";
import { ATLAS_BASE_URL, ATLAS_LLM_BASE_URL } from "@/lib/atlas-onekey";
import { migrateSettings, type SettingsState } from "@/lib/stores/settings-store";
import { settings } from "@/lib/i18n/messages/settings";

/** Pollinations real response (issue #19  original text from the follow-up screenshot). */
const CAP_ERROR_BODY = JSON.stringify({
  success: false,
  error: {
    message:
      '400 Bad Request: azure-openai error: Could not finish the message because max_tokens or model output limit was reached. Please try again with higher max_tokens.',
  },
});

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

/** spins up a fake provider that returns baseUrl. */
async function serve(handler: (req: IncomingMessage, res: ServerResponse, body: string) => void): Promise<string> {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => handler(req, res, raw));
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const CHAT_OK = { id: "x", choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }] };

describe("probe: separates output-cap 400s from real configuration errors", () => {
  it("Pollinations-style provider (400 whenever max_tokens is sent) → passes after one retry without the cap", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const base = await serve((req, res, body) => {
      const parsed = JSON.parse(body || "{}");
      seen.push(parsed);
      if (parsed.max_tokens !== undefined) return json(res, 400, CAP_ERROR_BODY);
      json(res, 200, CHAT_OK);
    });

    const out = await probeLLMEndpoint({ baseUrl: base, apiKey: "real-key", model: "openai-fast" });

    expect(out.ok).toBe(true);
    expect(out.warning).toBeUndefined();
    expect(seen).toHaveLength(2);
    expect(seen[0].max_tokens).toBe(PROBE_MAX_TOKENS);
    expect(seen[1].max_tokens).toBeUndefined();
  });

  it("reasoning-model provider (rejects max_tokens, requires max_completion_tokens) → rescued by the same fallback path", async () => {
    const base = await serve((req, res, body) => {
      if (JSON.parse(body || "{}").max_tokens !== undefined) {
        return json(res, 400, {
          error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." },
        });
      }
      json(res, 200, CHAT_OK);
    });
    expect((await probeLLMEndpoint({ baseUrl: base, apiKey: "k", model: "o5-mini" })).ok).toBe(true);
  });

  it("still 'output does not fit' without the cap → passes with a yellow warning (auth and model name are proven valid, a red cross would be wrong)", async () => {
    const base = await serve((_req, res) => json(res, 400, CAP_ERROR_BODY));
    const out = await probeLLMEndpoint({ baseUrl: base, apiKey: "k", model: "tiny" });
    expect(out.ok).toBe(true);
    expect(out.warning?.en).toContain("output budget");
    expect(out.warning?.en).toMatch(/output budget/i);
  });

  it("real parameter errors (400s unrelated to the token cap) still honestly fail, not masked by the fallback", async () => {
    let calls = 0;
    const base = await serve((_req, res) => {
      calls++;
      json(res, 400, { error: { message: "Invalid value for 'temperature'" } });
    });
    const out = await probeLLMEndpoint({ baseUrl: base, apiKey: "k", model: "m" });
    expect(out.ok).toBe(false);
    expect(out.status).toBe(400);
    expect(calls).toBe(1);
    expect(out.error?.en).toContain("Request rejected");
    expect(out.error?.en).toContain("temperature");
  });

  it("an invalid key is still a red cross (fixing the probe must not let 401 through)", async () => {
    const base = await serve((_req, res) => json(res, 401, { error: { message: "Unauthorized" } }));
    const out = await probeLLMEndpoint({ baseUrl: base, apiKey: "bad", model: "m" });
    expect(out.ok).toBe(false);
    expect(out.status).toBe(401);
    expect(out.error?.en).toContain("API key");
  });

  it("the retired keyless Pollinations address: fails without sending a request and gives migration guidance", async () => {
    const out = await probeLLMEndpoint({
      baseUrl: "https://text.pollinations.ai/openai",
      apiKey: "x",
      model: "openai-fast",
      fetchImpl: () => Promise.reject(new Error("should not send any request")),
    });
    expect(out.ok).toBe(false);
    expect(out.status).toBe(402);
    expect(out.error?.en).toContain("gen.pollinations.ai/v1");
  });

  it("without a model name falls back to key-level validation (GET /models)", async () => {
    const hit: string[] = [];
    const base = await serve((req, res) => {
      hit.push(req.url || "");
      json(res, 200, { data: [{ id: "m1" }] });
    });
    expect((await probeLLMEndpoint({ baseUrl: base, apiKey: "k" })).ok).toBe(true);
    expect(hit[0]).toContain("/models");
  });

  it("an extra trailing slash on baseUrl does not affect joining", async () => {
    const paths: string[] = [];
    const base = await serve((req, res) => {
      paths.push(req.url || "");
      json(res, 200, CHAT_OK);
    });
    await probeLLMEndpoint({ baseUrl: `${base}/`, apiKey: "k", model: "m" });
    expect(paths[0]).toBe("/v1/chat/completions");
  });
});

describe("generation path: when the vendor rejects our max_tokens it is dropped and retried automatically (preventive, not user-fixable)", () => {
  const okBody = { id: "x", choices: [{ index: 0, message: { role: "assistant", content: "done" }, finish_reason: "stop" }] };

  it("cap above the vendor ceiling → retries without max_tokens and the caller gets the successful result", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const base = await serve((_req, res, body) => {
      const parsed = JSON.parse(body || "{}");
      bodies.push(parsed);
      if (parsed.max_tokens !== undefined) {
        return json(res, 400, { error: { message: "max_tokens is greater than the maximum allowed (8192) for this model" } });
      }
      json(res, 200, okBody);
    });
    const client = createLLMClient({ baseUrl: base, apiKey: "k", model: "m" });
    const res = await client.chat.completions.create({ model: "m", messages: [{ role: "user", content: "hi" }], max_tokens: 16000 });
    expect(res.choices[0].message.content).toBe("done");
    expect(bodies).toHaveLength(2);
    expect(bodies[1].max_tokens).toBeUndefined();
  });

  it("reasoning model rejects the field name → renamed to max_completion_tokens instead of dropping the limit", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const base = await serve((_req, res, body) => {
      const parsed = JSON.parse(body || "{}");
      bodies.push(parsed);
      if (parsed.max_tokens !== undefined) {
        return json(res, 400, { error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." } });
      }
      json(res, 200, okBody);
    });
    const client = createLLMClient({ baseUrl: base, apiKey: "k", model: "o5" });
    await client.chat.completions.create({ model: "o5", messages: [{ role: "user", content: "hi" }], max_tokens: 16000 });
    expect(bodies[1].max_tokens).toBeUndefined();
    expect(bodies[1].max_completion_tokens).toBe(16000);
  });

  it("400s unrelated to the cap are thrown as-is: no retry, error content fully preserved (reading the body must not eat the message)", async () => {
    let calls = 0;
    const base = await serve((_req, res) => {
      calls++;
      json(res, 400, { error: { message: "Invalid value for 'temperature'" } });
    });
    const client = createLLMClient({ baseUrl: base, apiKey: "k", model: "m" });
    const err = await client.chat.completions
      .create({ model: "m", messages: [{ role: "user", content: "hi" }], max_tokens: 16000 })
      .catch((e) => e);
    expect(calls).toBe(1);
    expect(err.status).toBe(400);
    expect(String(err.message)).toContain("temperature");
  });

  it("requests without max_tokens are unaffected (one less body read; streaming responses must not be touched)", async () => {
    let calls = 0;
    const base = await serve((_req, res) => {
      calls++;
      json(res, 200, okBody);
    });
    const client = createLLMClient({ baseUrl: base, apiKey: "k", model: "m" });
    const res = await client.chat.completions.create({ model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(res.choices[0].message.content).toBe("done");
    expect(calls).toBe(1);
  });

  it("successful streaming responses pass the body through untouched (the error branch must never consume the SSE stream)", async () => {
    const base = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ id: "x", choices: [{ index: 0, delta: { content: "stream" } }] })}\n\n`);
      res.end("data: [DONE]\n\n");
    });
    const client = createLLMClient({ baseUrl: base, apiKey: "k", model: "m" });
    const stream = await client.chat.completions.create({ model: "m", messages: [{ role: "user", content: "hi" }], max_tokens: 16000, stream: true });
    let out = "";
    for await (const chunk of stream) out += chunk.choices[0]?.delta?.content ?? "";
    expect(out).toBe("stream");
  });
});

describe("probe: with a wrong model name, says which models this address really has", () => {
  /** replicates a local Ollama: bare name llama2.5 is not installed → 404; /models has llama2.5 with a tag: 7b-instruct. */
  const ollamaLike = () =>
    serve((req, res) => {
      if ((req.url || "").includes("/models")) {
        return json(res, 200, { object: "list", data: [{ id: "llama2.5:7b-instruct" }, { id: "llama3.2:latest" }] });
      }
      json(res, 404, { error: { message: 'model "llama2.5" not found, try pulling it first' } });
    });

  it("404 → lists the actually available models and guesses the tag the user meant", async () => {
    const base = await ollamaLike();
    const out = await probeLLMEndpoint({ baseUrl: base, apiKey: "ollama", model: "llama2.5" });
    expect(out.ok).toBe(false);
    expect(out.status).toBe(404);
    expect(out.error?.en).toContain("llama2.5:7b-instruct");
    expect(out.error?.en).toContain("Did you mean");
  });

  it("when /models cannot be read either, no second error is produced; only the original 404 copy is kept", async () => {
    const base = await serve((req, res) => {
      if ((req.url || "").includes("/models")) return json(res, 500, "boom");
      json(res, 404, { error: { message: "model not found" } });
    });
    const out = await probeLLMEndpoint({ baseUrl: base, apiKey: "k", model: "nope" });
    expect(out.ok).toBe(false);
    expect(out.error?.en).toContain("Endpoint or model not found");
  });

  it("the generation path (not just the settings page) also surfaces the available model list", async () => {
    const base = await ollamaLike();
    const client = new OpenAI({ baseURL: base, apiKey: "ollama", maxRetries: 0 });
    const err = await withLLMErrors(
      () => client.chat.completions.create({ model: "llama2.5", messages: [{ role: "user", content: "hi" }] }),
      { baseUrl: base, apiKey: "ollama", model: "llama2.5" },
    ).catch((e) => e);
    expect(err).toBeInstanceOf(LLMRequestError);
    expect(err.en).toContain("llama2.5:7b-instruct");
  });
});

describe("listModels / modelListHint", () => {
  it("parses OpenAI-compatible /models responses", async () => {
    const base = await serve((_req, res) => json(res, 200, { data: [{ id: "a" }, { id: "b" }, { id: 42 }] }));
    expect(await listModels(base, "k")).toEqual(["a", "b"]);
  });

  it("any exception returns an empty array (this only enriches errors and must not become a new error)", async () => {
    const bad = await serve((_req, res) => json(res, 200, "not json at all"));
    expect(await listModels(bad, "k")).toEqual([]);
    expect(await listModels("http://127.0.0.1:1/v1", "k")).toEqual([]);
  });

  it("with many models the list is truncated with the total count stated", () => {
    const hint = modelListHint(Array.from({ length: 30 }, (_, i) => `m${i}`), "zzz", "https://x.ai/v1");
    expect(hint?.en).toContain("30");
    expect(hint?.en.split(", ").length).toBeLessThanOrEqual(8);
  });

  it("Ollama with no models installed gets a pull command; a non-Ollama empty list gets no forced hint", () => {
    expect(modelListHint([], "llama2.5", "http://127.0.0.1:11434/v1")?.en).toContain("ollama pull");
    expect(modelListHint([], "gpt-4o", "https://api.openai.com/v1")).toBeUndefined();
  });

  it("endpoint detection and address normalization", () => {
    expect(isOllama("http://127.0.0.1:11434/v1")).toBe(true);
    expect(isOllama("http://localhost:11434")).toBe(true);
    expect(isOllama("https://api.openai.com/v1")).toBe(false);
    expect(normalizeBase("https://a.com/v1//")).toBe("https://a.com/v1");
  });
});

describe("copy: 400 must distinguish 'wrong model name' from 'model cannot fit'", () => {
  it("400 with output-cap signals → tells users to shorten content/switch models instead of changing the model name", () => {
    const { en } = explainLLMStatus(400, { detail: CAP_ERROR_BODY, model: "openai-fast" });
    expect(en).toContain("output budget");
    expect(en).not.toContain("wrong model name");
    expect(en).toMatch(/output budget/i);
  });

  it("plain 400 keeps the original wording", () => {
    expect(explainLLMStatus(400, { detail: "bad temperature" }).en).toContain("wrong model name");
  });

  it("isTokenCapRejection recognizes both phrasings and does not misfire on ordinary messages", () => {
    expect(isTokenCapRejection(CAP_ERROR_BODY)).toBe(true);
    expect(isTokenCapRejection("Use 'max_completion_tokens' instead")).toBe(true);
    expect(isTokenCapRejection("invalid api key")).toBe(false);
    expect(isTokenCapRejection(undefined)).toBe(false);
  });
});

describe("Ollama preset and migration (on Windows localhost resolves to ::1 first, while Ollama only listens on 127.0.0.1)", () => {
  it("the preset uses 127.0.0.1, not localhost", () => {
    const p = LLM_PRESETS.find((x) => x.label === "Ollama (local)");
    expect(p?.baseUrl).toBe("http://127.0.0.1:11434/v1");
  });

  it("localhost:11434 in old configs is rewritten on upgrade; other ports/domains are untouched", () => {
    const build = (baseUrl: string): SettingsState => ({ llm: { provider: "", baseUrl, apiKey: "", model: "" } }) as SettingsState;
    expect(migrateSettings(build("http://localhost:11434/v1")).llm.baseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(migrateSettings(build("http://localhost:3000/v1")).llm.baseUrl).toBe("http://localhost:3000/v1");
    expect(migrateSettings(build("https://api.openai.com/v1")).llm.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("copy keys for the model picker and Ollama hints are complete (a missing key only shows when a user opens it)", () => {
    for (const key of ["modelListButton", "modelListLoading", "modelListFilter", "modelListNoMatch", "modelListFailed", "ollamaModelHint"]) {
      expect(settings.en, `en:${key}`).toHaveProperty(key);
    }
  });
});

/**
 */
describe("Atlas dual gateway: chat uses /v1, assets use /api/v1 (issue #24)", () => {
  it("the asset gateway entered as the LLM address is rewritten to the chat gateway, including trailing slashes and case", () => {
    expect(normalizeChatBase(ATLAS_BASE_URL)).toBe(ATLAS_LLM_BASE_URL);
    expect(normalizeChatBase("https://api.atlascloud.ai/api/v1/")).toBe(ATLAS_LLM_BASE_URL);
    expect(normalizeChatBase("https://API.AtlasCloud.ai/api/v1")).toBe("https://API.AtlasCloud.ai/v1");
  });

  it("already-correct addresses, other vendors' /api/v1 and self-hosted proxies must not be touched", () => {
    expect(normalizeChatBase(ATLAS_LLM_BASE_URL)).toBe(ATLAS_LLM_BASE_URL);
    expect(normalizeChatBase("https://openrouter.ai/api/v1")).toBe("https://openrouter.ai/api/v1");
    expect(normalizeChatBase("https://example.examplecs.com/api/v1")).toBe("https://example.examplecs.com/api/v1");
    expect(normalizeChatBase("https://my-proxy.example.com/api/v1")).toBe("https://my-proxy.example.com/api/v1");
    expect(normalizeChatBase("https://api.atlascloud.ai/api/v1/model")).toBe("https://api.atlascloud.ai/api/v1/model");
  });

  it("the client that really sends requests gets the chat gateway", () => {
    const client = createLLMClient({ baseUrl: ATLAS_BASE_URL, apiKey: "k", model: "llmco-ai/llmco-v4-pro" });
    expect(client.baseURL).toBe(ATLAS_LLM_BASE_URL);
  });

  it("old installs that hit the trap self-heal on upgrade; other configs are unaffected", () => {
    const build = (baseUrl: string): SettingsState => ({ llm: { provider: "", baseUrl, apiKey: "", model: "" } }) as SettingsState;
    expect(migrateSettings(build(ATLAS_BASE_URL)).llm.baseUrl).toBe(ATLAS_LLM_BASE_URL);
    expect(migrateSettings(build(ATLAS_LLM_BASE_URL)).llm.baseUrl).toBe(ATLAS_LLM_BASE_URL);
    expect(migrateSettings(build("https://openrouter.ai/api/v1")).llm.baseUrl).toBe("https://openrouter.ai/api/v1");
  });

  it("one-key setup and the settings preset fill in the same address (two paths writing separately caused this incident)", () => {
    const preset = LLM_PRESETS.find((p) => /atlascloud/i.test(p.baseUrl));
    expect(preset?.baseUrl).toBe(ATLAS_LLM_BASE_URL);
  });
});
