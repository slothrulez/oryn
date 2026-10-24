import { describe, it, expect } from "vitest";
import { classifyError, friendlyError } from "@/lib/friendly-error";

describe("classifyError", () => {
  it("network/timeout", () => {
    expect(classifyError(new Error("Failed to fetch"))).toBe("network");
    expect(classifyError(new Error("The operation was aborted due to timeout"))).toBe("network");
    expect(classifyError("fetch failed")).toBe("network");
  });
  it("auth (401/403/key)", () => {
    expect(classifyError(new Error("Request failed: 401 Unauthorized"))).toBe("auth");
    expect(classifyError(new Error("invalid api key"))).toBe("auth");
  });
  it("rate limit (429)", () => {
    expect(classifyError(new Error("429 Too Many Requests"))).toBe("ratelimit");
  });
  it("server (5xx)", () => {
    expect(classifyError(new Error("502 Bad Gateway"))).toBe("server");
  });
  it("unknown", () => {
    expect(classifyError(new Error("some business validation failed"))).toBe("unknown");
  });
});

describe("friendlyError", () => {
  it("classified hits → actionable copy", () => {
    expect(friendlyError(new Error("Failed to fetch"), "en")).toMatch(/Network/);
    expect(friendlyError(new Error("Failed to fetch"), "en")).toMatch(/Network/);
    expect(friendlyError(new Error("401"), "en")).toMatch(/Settings/);
    expect(friendlyError(new Error("429"), "en")).toMatch(/Rate-limited/);
  });
  it("unknown → keeps the original message, falls back when empty", () => {
    expect(friendlyError(new Error("Business check X failed"), "en")).toBe("Business check X failed");
    expect(friendlyError("", "en")).toMatch(/went wrong/);
  });
});
