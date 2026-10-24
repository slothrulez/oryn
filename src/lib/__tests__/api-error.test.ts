import { describe, it, expect } from "vitest";
import { errText, apiError } from "@/lib/api-error";

/** build a fake request exposing only headers.get, matching what the helper reads */
function reqWith(acceptLanguage?: string) {
  return { headers: { get: (n: string) => (n.toLowerCase() === "accept-language" ? acceptLanguage ?? null : null) } };
}

describe("errText / apiError (English-only)", () => {
  it("errText returns the English message regardless of Accept-Language", () => {
    expect(errText(reqWith("en-US"), "Invalid project ID")).toBe("Invalid project ID");
    expect(errText(reqWith(undefined), "Invalid project ID")).toBe("Invalid project ID");
    expect(errText(reqWith("ja"), "Invalid project ID")).toBe("Invalid project ID");
  });
  it("apiError returns a response with an error field, default 400", async () => {
    const res = apiError(reqWith("en"), "Missing product name");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing product name" });
    const res2 = apiError(reqWith(undefined), "Project not found", 404);
    expect(res2.status).toBe(404);
    expect(await res2.json()).toEqual({ error: "Project not found" });
  });
});
