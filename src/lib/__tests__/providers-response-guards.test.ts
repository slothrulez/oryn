import { describe, it, expect, vi } from "vitest";
import { FalAIProvider } from "@/lib/providers/fal-ai";
import { ProviderError } from "@/lib/providers/base";

/**
 * Second-round audit fix regressions: providers did not guard API responses before calling .map or
 * accessing nested fields, so malformed responses (HTTP 200 but missing images/output/request_id)
 * would crash with TypeError instead of a clear error.
 * Now unified to throw ProviderError — mock request returns an empty response and we assert
 * ProviderError is thrown rather than a bare TypeError.
 */
const cfg = (name: string) => ({ name, apiKey: "test", baseUrl: "https://example.com" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRequest = (p: any, value: unknown) => vi.spyOn(p, "request").mockResolvedValue(value);

describe("provider response guards (audit fix: malformed responses throw ProviderError instead of crashing)", () => {
  it("FalAI generateImage: missing request_id → ProviderError instead of creating an 'm::undefined' task", async () => {
    const p = new FalAIProvider(cfg("fal"));
    mockRequest(p, {}); // no request_id
    await expect(p.generateImage({ modelId: "m", mode: "text-to-image", prompt: "x" })).rejects.toThrow(ProviderError);
  });
});
