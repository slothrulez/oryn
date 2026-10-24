import { describe, it, expect } from "vitest";
import { SERVER_MANAGED_KEY, resolveServerKey, serverAiDefaults } from "@/lib/server-keys";

describe("server-managed AI key", () => {
  it("swaps the sentinel for the environment key and leaves real keys alone", () => {
    const env = { OPENAI_API_KEY: "sk-test" };
    expect(resolveServerKey(SERVER_MANAGED_KEY, env)).toBe("sk-test");
    expect(resolveServerKey("sk-user", env)).toBe("sk-user");
    expect(resolveServerKey(undefined, env)).toBe("");
  });

  it("refuses the sentinel when the server has no key, so it never reaches a provider", () => {
    expect(() => resolveServerKey(SERVER_MANAGED_KEY, {})).toThrow(/OPENAI_API_KEY/);
  });

  it("publishes OpenAI defaults without the secret", () => {
    const d = serverAiDefaults({ OPENAI_API_KEY: "sk-test", ORYN_LLM_MODEL: "gpt-4o" });
    expect(d).toMatchObject({ llm: { provider: "openai", model: "gpt-4o", visionModel: "gpt-4o" }, imageModel: "gpt-image-2" });
    expect(JSON.stringify(d)).not.toContain("sk-test");
    expect(serverAiDefaults({})).toBeNull();
  });
});
