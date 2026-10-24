// @vitest-environment node
/**
 *
 */
import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
} from "openai";
import {
  FREE_POOL_RETRY_MS,
  LLMRequestError,
  createLLMClient,
  explainLLMError,
  explainLLMStatus,
  freePoolRetryFetch,
  isLegacyPollinations,
  isPollinations,
  jsonModeParams,
  llmErrorPair,
  optionalParamRetryFetch,
  toLLMRequestError,
  withLLMErrors,
} from "@/lib/llm-error";
import { settings } from "@/lib/i18n/messages/settings";
import { LLM_PRESETS } from "@/lib/llm-presets";
import { migrateSettings } from "@/lib/stores/settings-store";
import type { SettingsState } from "@/lib/stores/settings-store";

const LEGACY = "https://text.pollinations.ai/openai";
const NEW_POLLINATIONS = "https://gen.pollinations.ai/v1";

/** Build an SDK APIError with a real Headers object (the SDK reads requestID off it). */
function apiError(status: number, message = "boom", headers: Record<string, string> = {}): APIError {
  return new APIError(status, { message }, message, new Headers(headers));
}

describe("freePoolRetryFetch (translates free-pool 402 into the SDK's x-should-retry protocol)", () => {
  it("402 → sets x-should-retry:true and retry-after-ms so the SDK backs off and retries", async () => {
    const wrapped = freePoolRetryFetch(async () => new Response("no budget", { status: 402 }));
    const res = await wrapped("https://gen.pollinations.ai/v1/chat/completions");
    expect(res.status).toBe(402);
    expect(res.headers.get("x-should-retry")).toBe("true");
    expect(res.headers.get("retry-after-ms")).toBe(String(FREE_POOL_RETRY_MS));
    expect(await res.text()).toBe("no budget");
  });

  it("does not override a retry-after the server already sent (respects its throttling)", async () => {
    const wrapped = freePoolRetryFetch(
      async () => new Response("slow down", { status: 402, headers: { "retry-after": "30" } }),
    );
    const res = await wrapped("https://gen.pollinations.ai/v1/chat/completions");
    expect(res.headers.get("retry-after")).toBe("30");
    expect(res.headers.get("retry-after-ms")).toBeNull();
  });

  it("the retired old Pollinations address is not marked retryable: it only ever returns 402, so retrying wastes 90 seconds", async () => {
    const wrapped = freePoolRetryFetch(async () => new Response("dead", { status: 402 }));
    const res = await wrapped(`${LEGACY}/chat/completions`);
    expect(res.headers.get("x-should-retry")).toBeNull();
  });

  it("non-402 responses return as-is (200 is not rewrapped)", async () => {
    const original = new Response("ok", { status: 200 });
    const wrapped = freePoolRetryFetch(async () => original);
    expect(await wrapped("https://api.openai.com/v1/chat/completions")).toBe(original);
  });
});

describe("createLLMClient (retries are left to the openai SDK, not hand-rolled)", () => {
  it("keyless endpoints get a placeholder key (the SDK requires non-empty) and more retries", () => {
    const client = createLLMClient({ baseUrl: NEW_POLLINATIONS, apiKey: "", model: "openai-fast" });
    expect(client.apiKey).toBe("no-key");
    expect(client.maxRetries).toBe(3);
  });

  it("only anonymous Pollinations retries 402: a 402 with a key means the daily quota is used up and waiting is pointless", async () => {
    const hits = async (apiKey: string) => {
      let calls = 0;
      const server = createServer((_req, res) => {
        calls++;
        res.writeHead(402, { "content-type": "application/json", "retry-after-ms": "5" });
        res.end(JSON.stringify({ error: "402 Payment Required" }));
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      const port = (server.address() as AddressInfo).port;
      try {
        const client = createLLMClient({ baseUrl: `http://127.0.0.1:${port}/pollinations.ai/v1`, apiKey, model: "m" });
        await client.chat.completions.create({ model: "m", messages: [{ role: "user", content: "hi" }] }).catch(() => {});
        return calls;
      } finally {
        server.close();
      }
    };
    expect(await hits("")).toBeGreaterThan(1);
    expect(await hits("real-key")).toBe(1);
  });
});

describe("integration: the real openai SDK + a fake provider (verifies the SDK honors the 402 retry protocol)", () => {
  it("free pool recovers after consecutive 402s → the SDK retries to success transparently", async () => {
    let calls = 0;
    const server = createServer((_req, res) => {
      calls++;
      if (calls <= 2) {
        res.writeHead(402, { "content-type": "application/json", "retry-after-ms": "10" });
        return res.end(JSON.stringify({ error: "402 Payment Required" }));
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "x", choices: [{ index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" }] }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    try {
      const client = new OpenAI({
        baseURL: `http://127.0.0.1:${port}/v1`,
        apiKey: "no-key",
        maxRetries: 3,
        fetch: freePoolRetryFetch(),
      });
      const res = await client.chat.completions.create({ model: "openai-fast", messages: [{ role: "user", content: "hi" }] });
      expect(res.choices[0].message.content).toBe("OK");
      expect(calls).toBe(3);
    } finally {
      server.close();
    }
  });

  it("402 forever → throws APIError(402) after retries run out, for the copy layer to explain in plain words", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(402, { "content-type": "application/json", "retry-after-ms": "5" });
      res.end(JSON.stringify({ error: "402 Payment Required" }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    try {
      const client = new OpenAI({ baseURL: `http://127.0.0.1:${port}/v1`, apiKey: "no-key", maxRetries: 1, fetch: freePoolRetryFetch() });
      const err = await withLLMErrors(
        () => client.chat.completions.create({ model: "openai-fast", messages: [{ role: "user", content: "hi" }] }),
        { baseUrl: LEGACY, model: "openai-fast" },
      ).catch((e) => e);
      expect(err).toBeInstanceOf(LLMRequestError);
      expect(err.status).toBe(402);
      expect(err.en).toContain("gen.pollinations.ai/v1");
    } finally {
      server.close();
    }
  });
});

describe("endpoint detection", () => {
  it("old and new Pollinations both count as Pollinations; only the old address is a retired endpoint", () => {
    expect(isPollinations(LEGACY)).toBe(true);
    expect(isPollinations(NEW_POLLINATIONS)).toBe(true);
    expect(isLegacyPollinations(LEGACY)).toBe(true);
    expect(isLegacyPollinations(NEW_POLLINATIONS)).toBe(false);
    expect(isPollinations("https://api.openai.com/v1")).toBe(false);
    expect(isPollinations(undefined)).toBe(false);
  });
});

describe("explainLLMStatus (every failure must say what to do next)", () => {
  it("old Pollinations address 402 → points to the new endpoint + the free key page (the original issue #19 scenario)", () => {
    const { en } = explainLLMStatus(402, { baseUrl: LEGACY, model: "openai-fast" });
    expect(en).toContain("gen.pollinations.ai/v1");
    expect(en).toContain("enter.pollinations.ai/keys");
    expect(en).toContain("Ollama");
    expect(en).toContain("enter.pollinations.ai/keys");
  });

  it("new Pollinations address 402 → explains the daily free quota is used up instead of telling people to change the address", () => {
    const { en } = explainLLMStatus(402, { baseUrl: NEW_POLLINATIONS, model: "openai-fast" });
    expect(en).toContain("credit exhausted");
    expect(en).not.toContain("retired");
  });

  it("ordinary vendor 402 → top up/switch channels, no mention of Pollinations", () => {
    const { en } = explainLLMStatus(402, { baseUrl: "https://api.llmco.com", model: "x" });
    expect(en).toContain("top it up");
    expect(en).not.toContain("Pollinations");
  });

  it("401/403 mention the key, 404 includes the model name, 429 mentions rate limiting", () => {
    expect(explainLLMStatus(401, {}).en).toContain("API key");
    expect(explainLLMStatus(403, {}).en).toContain("API key");
    expect(explainLLMStatus(404, { model: "gpt-9" }).en).toContain("gpt-9");
    expect(explainLLMStatus(429, {}).en).toContain("Rate limited");
    expect(explainLLMStatus(503, {}).en).toContain("5xx");
  });
});

describe("explainLLMError (SDK error classes → copy, including status-less connection failures)", () => {
  it("connection failures/timeouts use the SDK's connection error class and point to the network and local Ollama", () => {
    const conn = explainLLMError(new APIConnectionError({ message: "fetch failed" }), {
      baseUrl: "http://localhost:11434/v1",
      model: "llama2.5",
    });
    expect(conn.en).toContain("ollama serve");
    const timeout = explainLLMError(new APIConnectionTimeoutError({ message: "timed out" }), {});
    expect(timeout.en).toContain("timed out");
  });

  it("includes the model/address/raw error so users can screenshot feedback", () => {
    const out = explainLLMError(apiError(402, "402 Payment Required"), { baseUrl: LEGACY, model: "openai-fast" });
    expect(out.status).toBe(402);
    expect(out.en).toContain("openai-fast");
    expect(out.en).toContain(LEGACY);
    expect(out.en).toContain("402 Payment Required");
  });

  it("each specific SDK error subclass maps to its own copy", () => {
    const t = { baseUrl: "https://api.openai.com/v1", model: "gpt-5.4" };
    expect(explainLLMError(new AuthenticationError(401, {}, "bad key", new Headers()), t).en).toContain("API key");
    expect(explainLLMError(new NotFoundError(404, {}, "no model", new Headers()), t).en).toContain("gpt-5.4");
    expect(explainLLMError(new RateLimitError(429, {}, "slow", new Headers()), t).en).toContain("Rate limited");
  });
});

describe("withLLMErrors (only translates errors, no retries — retries belong to the SDK)", () => {
  it("success passes the return value straight through", async () => {
    await expect(withLLMErrors(async () => "ok", {})).resolves.toBe("ok");
  });

  it("failures are wrapped into an LLMRequestError the API routes return to the client", async () => {
    const err = await withLLMErrors(() => Promise.reject(apiError(402)), { baseUrl: LEGACY, model: "openai-fast" }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(LLMRequestError);
    expect(err.status).toBe(402);
    const pair = llmErrorPair(err);
    expect(pair.en).toContain("enter.pollinations.ai/keys");
    expect(pair.en).toContain("Pollinations");
  });

  it("user cancellation is not rewritten as a failure (the frontend uses this to tell cancel from error)", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "APIUserAbortError" });
    await expect(withLLMErrors(() => Promise.reject(abort), {})).rejects.toBe(abort);
  });

  it("an existing LLMRequestError is not wrapped twice", () => {
    const original = new LLMRequestError("english", 402);
    expect(toLLMRequestError(original, {})).toBe(original);
  });

  it("non-LLM errors (parse failures etc.) keep the same text and lose no information", () => {
    expect(llmErrorPair(new Error("JSON parse failed"))).toEqual({ en: "JSON parse failed" });
  });
});

describe("LLM_PRESETS (presets are a new user's only entry point; a dead endpoint means unusable out of the box)", () => {
  it("no preset points to the retired text.pollinations.ai", () => {
    expect(LLM_PRESETS.filter((p) => isLegacyPollinations(p.baseUrl))).toEqual([]);
  });

  it("the Pollinations preset points to the new endpoint and no longer prefills a placeholder key (otherwise 401 would masquerade as configured)", () => {
    const p = LLM_PRESETS.find((x) => x.label === "Pollinations");
    expect(p?.baseUrl).toBe(NEW_POLLINATIONS);
    expect(p?.apiKey).toBeUndefined();
  });

  it("only truly keyless local Ollama prefills a placeholder key", () => {
    expect(LLM_PRESETS.filter((p) => p.apiKey).map((p) => p.label)).toEqual(["Ollama (local)"]);
  });

  it("every tipKey exists in the copy (the settings page renders client-side, so a missing key only shows when a user opens it)", () => {
    for (const p of LLM_PRESETS) {
      if (!p.tipKey) continue;
      expect(settings.en, `en:${p.tipKey}`).toHaveProperty(p.tipKey);
    }
  });

  it("every preset fills in baseUrl and a model name (missing either only blows up at generation time)", () => {
    for (const p of LLM_PRESETS) {
      expect(p.baseUrl, p.label).toMatch(/^https?:\/\//);
      expect(p.model.length, p.label).toBeGreaterThan(0);
    }
  });
});

describe("migrateSettings v2 (old users with the retired Pollinations address stored locally self-heal on upgrade)", () => {
  const build = (llm: Partial<SettingsState["llm"]>): SettingsState =>
    ({ llm: { provider: "", baseUrl: "", apiKey: "", model: "", ...llm } }) as SettingsState;

  it("old keyless address → new endpoint, and the placeholder key is cleared (a placeholder makes unconfigured look configured)", () => {
    const out = migrateSettings(build({ baseUrl: LEGACY, apiKey: "pollinations", model: "openai-fast" }));
    expect(out.llm.baseUrl).toBe(NEW_POLLINATIONS);
    expect(out.llm.apiKey).toBe("");
    expect(out.llm.model).toBe("openai-fast");
  });

  it("real keys the user entered are not cleared", () => {
    const out = migrateSettings(build({ baseUrl: LEGACY, apiKey: "my-real-key", model: "openai-fast" }));
    expect(out.llm.baseUrl).toBe(NEW_POLLINATIONS);
    expect(out.llm.apiKey).toBe("my-real-key");
  });


});

describe("optionalParamRetryFetch (replays once without an optional parameter when it is rejected by name)", () => {
  const body = JSON.stringify({ model: "m", messages: [], response_format: { type: "json_object" }, enable_thinking: false });

  it("400 naming response_format → replays without that field", async () => {
    const calls: string[] = [];
    const wrapped = optionalParamRetryFetch(async (_url, init) => {
      calls.push(init?.body as string);
      if (calls.length === 1) return new Response('{"error":"response_format is not supported"}', { status: 400 });
      return new Response('{"ok":true}', { status: 200 });
    });
    const res = await wrapped("http://x/v1/chat/completions", { method: "POST", body });
    expect(res.status).toBe(200);
    const replayed = JSON.parse(calls[1]);
    expect(replayed.response_format).toBeUndefined();
    expect(replayed.enable_thinking).toBe(false);
  });

  it("400 unrelated to optional parameters → returned as-is without replay", async () => {
    let calls = 0;
    const wrapped = optionalParamRetryFetch(async () => {
      calls++;
      return new Response('{"error":"model not found"}', { status: 400 });
    });
    const res = await wrapped("http://x", { method: "POST", body });
    expect(res.status).toBe(400);
    expect(calls).toBe(1);
    expect(await res.text()).toContain("model not found");
  });

  it("no optional parameters in the request → does not read the body or replay", async () => {
    let calls = 0;
    const wrapped = optionalParamRetryFetch(async () => {
      calls++;
      return new Response("bad", { status: 400 });
    });
    const res = await wrapped("http://x", { method: "POST", body: JSON.stringify({ model: "m" }) });
    expect(res.status).toBe(400);
    expect(calls).toBe(1);
  });

  it("successful responses pass straight through (the streaming body is not consumed)", async () => {
    const wrapped = optionalParamRetryFetch(async () => new Response("stream", { status: 200 }));
    const res = await wrapped("http://x", { method: "POST", body });
    expect(await res.text()).toBe("stream");
  });

  it("jsonModeParams is enabled only for endpoints known to support it", () => {
    expect(jsonModeParams("https://api.openai.com/v1")).toEqual({ response_format: { type: "json_object" } });
    expect(jsonModeParams("https://api.atlascloud.ai/v1")).toEqual({ response_format: { type: "json_object" } });
    expect(jsonModeParams("https://gen.pollinations.ai/v1")).toEqual({});
    expect(jsonModeParams("")).toEqual({});
    expect(jsonModeParams(undefined)).toEqual({});
  });
});
