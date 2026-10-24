/**
 * Server-managed AI keys. When the operator sets OPENAI_API_KEY on the server, merchants need no
 * settings of their own: the browser stores this sentinel instead of a real key and every server-side
 * call swaps it for the environment key. The real key never reaches the client.
 */
export const SERVER_MANAGED_KEY = "__oryn_server_key__";

export const SERVER_LLM_BASE_URL = "https://api.openai.com/v1";

export interface ServerAiDefaults {
  llm: { provider: string; baseUrl: string; model: string; visionModel: string };
  imageModel: string;
}

export function hasServerKey(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.OPENAI_API_KEY?.trim();
}

/** Defaults the client adopts when the server holds the key (no secret included). */
export function serverAiDefaults(env: Record<string, string | undefined> = process.env): ServerAiDefaults | null {
  if (!hasServerKey(env)) return null;
  const model = env.ORYN_LLM_MODEL?.trim() || "gpt-4o-mini";
  return {
    llm: { provider: "openai", baseUrl: SERVER_LLM_BASE_URL, model, visionModel: env.ORYN_VISION_MODEL?.trim() || model },
    imageModel: env.ORYN_IMAGE_MODEL?.trim() || "gpt-image-2",
  };
}

/** Swap the client sentinel for the real server key; any other value passes through untouched. */
export function resolveServerKey(apiKey: string | undefined, env: Record<string, string | undefined> = process.env): string {
  if (apiKey !== SERVER_MANAGED_KEY) return apiKey ?? "";
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("This deployment has no server-managed AI key (OPENAI_API_KEY); add your own key in Settings");
  return key;
}
